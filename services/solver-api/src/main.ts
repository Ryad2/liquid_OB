import { createPublicClient, http } from 'viem'

import { loadRuntimeConfig } from './config.js'
import { LiquidOBGraphClient } from './graph-client.js'
import { ViemChainGateway } from './onchain.js'
import { RouteService } from './service.js'
import { buildServer } from './server.js'

const config = await loadRuntimeConfig()
const graph = new LiquidOBGraphClient({
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
const server = await buildServer({
  service,
  corsOrigins: config.corsOrigins,
  logger: true,
})

await server.listen({ host: config.host, port: config.port })
