import type { IncomingMessage, ServerResponse } from 'node:http'

import { buildRuntimeHttpHandler } from './runtime.js'

const runtimeHandler = buildRuntimeHttpHandler()

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  request.url = mcpPath(request.url)
  await runtimeHandler(request, response)
}

export function mcpPath(value: string | undefined): string {
  const url = new URL(value ?? '/', 'http://vercel.invalid')
  const rewrittenPath = url.searchParams.get('__mcp_path')
  const pathname = rewrittenPath === null
    ? url.pathname.replace(/^\/api\/mcp/, '') || '/'
    : `/${rewrittenPath.replace(/^\/+/, '')}`
  url.searchParams.delete('__mcp_path')
  const query = url.searchParams.toString()
  return `${pathname}${query === '' ? '' : `?${query}`}`
}
