import { createPublicClient, http } from 'viem'

import { loadRuntimeConfig } from './config.js'
import { LiquidOBGraphClient } from './graph-client.js'
import { ViemChainGateway } from './onchain.js'
import { LiquidOBProductGraphClient } from './product-graph.js'
import { ProductService } from './product-service.js'
import { RouteService } from './service.js'
import { buildServer } from './server.js'

const config = await loadRuntimeConfig()
const graph = new LiquidOBGraphClient({
  endpoint: config.subgraphUrl,
  pageSize: config.pageSize,
})
const productGraph = new LiquidOBProductGraphClient({
  endpoint: config.subgraphUrl,
  pageSize: config.pageSize,
})
const chain = new ViemChainGateway(
  createPublicClient({ transport: http(config.rpcUrl, { timeout: 10_000 }) }),
  config.manifest,
)
const service = new RouteService(graph, chain, {
  chainId: config.manifest.network.chainId,
  maxFills: config.maxFills,
  reserveCount: config.reserveCount,
  maxIndexLag: config.maxIndexLag,
})
const product = new ProductService(productGraph, chain, {
  manifest: config.manifest,
  maxIndexLag: config.maxIndexLag,
})
const server = await buildServer({
  service,
  product,
  corsOrigins: config.corsOrigins,
  logger: true,
})

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
