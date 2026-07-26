import { solveRoute, type SolverCandidate } from '../../../packages/solver-core/src/index.js'

import { ApiError } from './errors.js'
import type {
  ChainGateway,
  GraphGateway,
  PreparedRoute,
  RouteRequest,
  ServiceConfig,
} from './types.js'

export class RouteService {
  readonly #graph: GraphGateway
  readonly #chain: ChainGateway
  readonly #config: ServiceConfig

  constructor(graph: GraphGateway, chain: ChainGateway, config: ServiceConfig) {
    this.#graph = graph
    this.#chain = chain
    this.#config = config
  }

  async health(signal?: AbortSignal) {
    const [graph, chain] = await Promise.allSettled([
      this.#graph.health(signal),
      this.#chain.health(),
    ])
    if (chain.status === 'fulfilled' && chain.value.chainId !== this.#config.chainId) {
      return {
        status: 'offline' as const,
        chainId: chain.value.chainId,
        expectedChainId: this.#config.chainId,
        chainHeadBlock: chain.value.headBlock,
        indexedBlock: graph.status === 'fulfilled' ? graph.value.indexedBlock : null,
        indexLag: null,
        indexingErrors: graph.status === 'fulfilled' ? graph.value.indexingErrors : null,
        message: 'RPC chain does not match the deployment manifest',
      }
    }
    const head = chain.status === 'fulfilled' ? chain.value.headBlock : null
    const indexed = graph.status === 'fulfilled' ? graph.value.indexedBlock : null
    const lag = head !== null && indexed !== null && head >= indexed ? head - indexed : null
    const healthy = graph.status === 'fulfilled'
      && chain.status === 'fulfilled'
      && !graph.value.indexingErrors
      && lag !== null
      && lag <= this.#config.maxIndexLag
    return {
      status: healthy ? 'healthy' as const : 'degraded' as const,
      chainId: chain.status === 'fulfilled' ? chain.value.chainId : null,
      expectedChainId: this.#config.chainId,
      chainHeadBlock: head,
      indexedBlock: indexed,
      indexLag: lag,
      indexingErrors: graph.status === 'fulfilled' ? graph.value.indexingErrors : null,
      message: healthy ? 'Subgraph and RPC are synchronized' : healthMessage(graph, chain, lag, this.#config.maxIndexLag),
    }
  }

  async quote(request: RouteRequest, simulate: boolean, signal?: AbortSignal): Promise<PreparedRoute> {
    const [market, chain] = await Promise.all([
      this.#graph.candidates(request.marketId, request.side, signal),
      this.#chain.health(),
    ])
    if (chain.chainId !== this.#config.chainId) {
      throw new ApiError('CHAIN_MISMATCH', 503, `RPC chain ${chain.chainId} does not match ${this.#config.chainId}`)
    }
    if (market.indexingErrors) {
      throw new ApiError('SUBGRAPH_INDEXING_ERROR', 503, 'Subgraph reports deterministic indexing errors')
    }
    if (market.indexedBlock > chain.headBlock) {
      throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Indexed block is ahead of the configured RPC head')
    }
    const lag = chain.headBlock - market.indexedBlock
    if (lag > this.#config.maxIndexLag) {
      throw new ApiError('SUBGRAPH_STALE', 503, 'Subgraph snapshot is too stale for best execution', {
        indexedBlock: market.indexedBlock.toString(),
        chainHeadBlock: chain.headBlock.toString(),
        indexLag: lag.toString(),
      })
    }

    const fixedDecimals = fixedTokenDecimals(request, market)
    const amountWad = rawToWad(request.amount, fixedDecimals)
    const initial = solveRoute({
      marketId: request.marketId,
      side: request.side,
      kind: request.kind,
      amountWad,
      maxFills: this.#config.maxFills,
      reserveCount: this.#config.reserveCount,
      snapshotBlock: market.indexedBlock,
      candidates: market.candidates,
    })
    const candidateByKey = new Map(
      market.candidates.map((candidate) => [candidate.positionKey.toLowerCase(), candidate]),
    )
    const shortlist = uniqueCandidates([
      ...initial.fills.map((fill) => fill.candidate),
      ...initial.reserveCandidates.map((reserve) => candidateByKey.get(reserve.positionKey.toLowerCase())),
    ].filter((candidate): candidate is SolverCandidate => candidate !== undefined))
    const refreshed = await this.#chain.refreshCandidates(shortlist)
    const finalCertificate = solveRoute({
      marketId: request.marketId,
      side: request.side,
      kind: request.kind,
      amountWad,
      maxFills: this.#config.maxFills,
      reserveCount: this.#config.reserveCount,
      snapshotBlock: market.indexedBlock,
      candidates: refreshed,
    })
    return this.#chain.prepareRoute(request, market, finalCertificate, chain.headBlock, simulate)
  }
}

function rawToWad(raw: bigint, decimals: number): bigint {
  if (raw <= 0n) throw new ApiError('INVALID_REQUEST', 400, 'Amount must be positive')
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new ApiError('INVALID_REQUEST', 400, 'Token decimals exceed the ArcBook MVP domain')
  }
  return raw * (10n ** BigInt(18 - decimals))
}

function fixedTokenDecimals(
  request: RouteRequest,
  market: { baseToken: { decimals: number }; quoteToken: { decimals: number } },
): number {
  if (request.kind === 'exact-input') {
    return request.side === 'sell' ? market.quoteToken.decimals : market.baseToken.decimals
  }
  return request.side === 'sell' ? market.baseToken.decimals : market.quoteToken.decimals
}

function uniqueCandidates(candidates: readonly SolverCandidate[]): SolverCandidate[] {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = candidate.positionKey.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function healthMessage(
  graph: PromiseSettledResult<unknown>,
  chain: PromiseSettledResult<unknown>,
  lag: bigint | null,
  maxLag: bigint,
): string {
  if (chain.status === 'rejected') return 'RPC is unavailable'
  if (graph.status === 'rejected') return 'Subgraph is unavailable'
  if (lag === null) return 'Freshness cannot be established'
  if (lag > maxLag) return `Subgraph lag ${lag} exceeds ${maxLag} blocks`
  return 'Subgraph reports indexing errors'
}
