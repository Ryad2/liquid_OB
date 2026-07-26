import type { IncomingMessage, ServerResponse } from 'node:http'

import { buildRuntimeServer } from './runtime.js'

let serverPromise: ReturnType<typeof prepareServer> | undefined

async function prepareServer() {
  const { server } = await buildRuntimeServer()
  await server.ready()
  return server
}

async function runtimeServer() {
  try {
    return await (serverPromise ??= prepareServer())
  } catch (error) {
    // A transient dependency failure must not poison every later warm invocation.
    serverPromise = undefined
    throw error
  }
}

export default async function handler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const server = await runtimeServer()
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
  const rewrittenPath = url.searchParams.get('__solver_path')
  const pathname = rewrittenPath === null
    ? url.pathname.replace(/^\/api\/solver/, '') || '/'
    : `/${rewrittenPath.replace(/^\/+/, '')}`
  url.searchParams.delete('__solver_path')
  const query = url.searchParams.toString()
  return `${pathname}${query === '' ? '' : `?${query}`}`
}
