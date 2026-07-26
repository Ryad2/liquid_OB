import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'

import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

import { createLiquidityMcpServer } from './mcp-server.js'
import type { ExecutableLiquidityService } from './service.js'

interface HttpOptions {
  host: string
  port: number
  allowedOrigins: string[]
}

export function createHttpHandler(service: ExecutableLiquidityService, options: HttpOptions) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    securityHeaders(response)
    if (!originAllowed(request, options.allowedOrigins)) {
      sendJson(response, 403, { error: 'Origin is not allowed' })
      return
    }
    applyCors(request, response, options.allowedOrigins)
    if (request.method === 'OPTIONS') {
      response.writeHead(204).end()
      return
    }
    if (request.url === '/healthz' && request.method === 'GET') {
      sendJson(response, 200, { status: 'alive', uptimeSeconds: Math.floor(process.uptime()) })
      return
    }
    if (request.url === '/readyz' && request.method === 'GET') {
      try {
        await service.health(AbortSignal.timeout(5_000))
        sendJson(response, 200, { status: 'ready' })
      } catch (error) {
        sendJson(response, 503, { status: 'not-ready', error: message(error) })
      }
      return
    }
    if (request.url !== '/mcp') {
      sendJson(response, 404, { error: 'Not found' })
      return
    }
    if (request.method !== 'POST') {
      sendJson(response, 405, { jsonrpc: '2.0', error: { code: -32_000, message: 'Method not allowed' }, id: null })
      return
    }

    let body: unknown
    try {
      body = await readJson(request, 64 * 1024)
    } catch (error) {
      sendJson(response, 400, { jsonrpc: '2.0', error: { code: -32_700, message: message(error) }, id: null })
      return
    }
    const mcp = createLiquidityMcpServer(service)
    // The v1 SDK models an explicitly stateless undefined session generator
    // incompatibly with exactOptionalPropertyTypes, although runtime requires it.
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    } as unknown as ConstructorParameters<typeof StreamableHTTPServerTransport>[0])
    try {
      await mcp.connect(transport as unknown as Transport)
      await transport.handleRequest(request, response, body)
    } catch {
      if (!response.headersSent) {
        sendJson(response, 500, { jsonrpc: '2.0', error: { code: -32_603, message: 'Internal server error' }, id: null })
      }
    } finally {
      await transport.close().catch(() => undefined)
      await mcp.close().catch(() => undefined)
    }
  }
}

export async function startHttpServer(service: ExecutableLiquidityService, options: HttpOptions): Promise<Server> {
  const server = createServer(createHttpHandler(service, options))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, options.host, () => {
      server.off('error', reject)
      resolve()
    })
  })
  return server
}

async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  const declared = Number(request.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > limit) throw new Error('Request body is too large')
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > limit) throw new Error('Request body is too large')
    chunks.push(buffer)
  }
  if (chunks.length === 0) throw new Error('Request body is empty')
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function originAllowed(request: IncomingMessage, allowed: string[]): boolean {
  const origin = request.headers.origin
  return origin === undefined || allowed.includes(origin)
}

function applyCors(request: IncomingMessage, response: ServerResponse, allowed: string[]): void {
  const origin = request.headers.origin
  if (origin !== undefined && allowed.includes(origin)) {
    response.setHeader('access-control-allow-origin', origin)
    response.setHeader('vary', 'Origin')
    response.setHeader('access-control-allow-methods', 'POST, OPTIONS')
    response.setHeader('access-control-allow-headers', 'content-type, mcp-protocol-version, mcp-session-id')
    response.setHeader('access-control-expose-headers', 'mcp-session-id')
  }
}

function securityHeaders(response: ServerResponse): void {
  response.setHeader('cache-control', 'no-store')
  response.setHeader('x-content-type-options', 'nosniff')
  response.setHeader('x-frame-options', 'DENY')
  response.setHeader('referrer-policy', 'no-referrer')
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(body))
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
