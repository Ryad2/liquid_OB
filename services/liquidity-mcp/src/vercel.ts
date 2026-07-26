import type { IncomingMessage, ServerResponse } from 'node:http'

import { buildRuntimeHttpHandler } from './runtime.js'

const runtimeHandler = buildRuntimeHttpHandler()

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  request.url = mcpPath(request.url)
  await runtimeHandler(request, response)
}

export function mcpPath(value: string | undefined): string {
  const url = new URL(value ?? '/', 'http://vercel.invalid')
  const pathname = url.pathname.replace(/^\/api\/mcp/, '') || '/'
  return `${pathname}${url.search}`
}
