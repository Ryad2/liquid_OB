import { createPublicClient, http, type PublicClient } from 'viem'
import { baseSepolia } from 'viem/chains'

import { loadRuntimeConfig } from './config.js'
import { LiquidOBGraphClient } from './graph-client.js'
import { ViemChainGateway } from './onchain.js'
import { LiquidOBProductGraphClient } from './product-graph.js'
import { ProductService } from './product-service.js'
import { buildServer } from './server.js'
import { RouteService } from './service.js'

export async function buildRuntimeServer(environment: NodeJS.ProcessEnv = process.env) {
  const config = await loadRuntimeConfig(environment)
  const graph = new LiquidOBGraphClient({
    endpoint: config.subgraphUrl,
    pageSize: config.pageSize,
  })
  const productGraph = new LiquidOBProductGraphClient({
    endpoint: config.subgraphUrl,
    pageSize: config.pageSize,
  })
  const chain = new ViemChainGateway(
    createPublicClient({
      chain: {
        ...baseSepolia,
        name: config.manifest.network.name,
        rpcUrls: { default: { http: [config.rpcUrl] } },
      },
      transport: http(config.rpcUrl, { timeout: 10_000 }),
    }) as unknown as PublicClient,
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
  return { config, server }
}
