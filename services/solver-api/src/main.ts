import { buildRuntimeServer } from './runtime.js'

const { config, server } = await buildRuntimeServer()

await server.listen({ host: config.host, port: config.port })

let closing = false
const shutdown = async (signal: string) => {
  if (closing) return
  closing = true
  server.log.info({ signal }, 'shutting down solver API')
  const forcedExit = setTimeout(() => process.exit(1), 10_000)
  forcedExit.unref()
  try {
    await server.close()
    clearTimeout(forcedExit)
    process.exit(0)
  } catch (error) {
    server.log.error(error, 'solver API shutdown failed')
    process.exit(1)
  }
}

process.once('SIGTERM', () => void shutdown('SIGTERM'))
process.once('SIGINT', () => void shutdown('SIGINT'))
