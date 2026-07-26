import type { IncomingMessage, ServerResponse } from 'node:http'

import { buildRuntimeServer } from './runtime.js'

const serverPromise = buildRuntimeServer().then(async ({ server }) => {
  await server.ready()
  return server
})

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const server = await serverPromise
  request.url = solverPath(request.url)
  await new Promise<void>((resolve, reject) => {
    const done = () => {
      response.off('finish', done)
      response.off('close', done)
      resolve()
    }
    response.once('finish', done)
    response.once('close', done)
    try {
      server.server.emit('request', request, response)
    } catch (error) {
      response.off('finish', done)
      response.off('close', done)
      reject(error instanceof Error ? error : new Error(String(error)))
    }
  })
}

export function solverPath(value: string | undefined): string {
  const url = new URL(value ?? '/', 'http://vercel.invalid')
  const pathname = url.pathname.replace(/^\/api\/solver/, '') || '/'
  return `${pathname}${url.search}`
}
