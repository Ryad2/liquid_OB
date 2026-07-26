import { once } from 'node:events'

import { afterEach, describe, expect, it } from 'vitest'

import { startHttpServer } from '../http.js'
import { ExecutableLiquidityService } from '../service.js'
import { FakeDex, FakeLiquidOB } from './fixtures.js'

describe('public MCP HTTP transport', () => {
  const servers: Awaited<ReturnType<typeof startHttpServer>>[] = []

  afterEach(async () => {
    await Promise.all(servers.splice(0).map(async (server) => {
      server.close()
      await once(server, 'close')
    }))
  })

  it('serves probes and negotiates the MCP protocol without a session', async () => {
    const service = new ExecutableLiquidityService(new FakeLiquidOB(), new FakeDex())
    const server = await startHttpServer(service, { host: '127.0.0.1', port: 0, allowedOrigins: [] })
    servers.push(server)
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Expected an ephemeral TCP listener')
    const baseUrl = `http://127.0.0.1:${address.port}`

    expect(await (await fetch(`${baseUrl}/healthz`)).json()).toMatchObject({ status: 'alive' })
    expect(await (await fetch(`${baseUrl}/readyz`)).json()).toEqual({ status: 'ready' })
    const response = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-11-25',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' },
        },
      }),
    })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.result.serverInfo.name).toBe('liquid-ob-executable-liquidity')
    expect(response.headers.get('mcp-session-id')).toBeNull()

    const toolResponse = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': '2025-11-25',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'discover_positions',
          arguments: { marketId: '0x' + '11'.repeat(32), side: 'sell', limit: 3 },
        },
      }),
    })
    const toolPayload = await toolResponse.json()
    expect(toolResponse.status).toBe(200)
    expect(toolPayload.result.structuredContent).toMatchObject({ discoveredCount: 1, side: 'sell' })

    const crossOrigin = await fetch(`${baseUrl}/healthz`, { headers: { origin: 'https://untrusted.example' } })
    expect(crossOrigin.status).toBe(403)
  })
})
