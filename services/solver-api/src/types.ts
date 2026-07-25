import type { RouteCertificate, SolverCandidate } from '@liquid-ob/solver-core'
import type { Address, Hex } from 'viem'

export interface IndexedToken {
  address: Address
  symbol: string
  name: string
  decimals: number
}

export interface IndexedMarketSnapshot {
  marketId: Hex
  baseToken: IndexedToken
  quoteToken: IndexedToken
  indexedBlock: bigint
  indexedBlockHash: Hex | null
  indexingErrors: boolean
  candidates: SolverCandidate[]
}

export interface GraphHealth {
  indexedBlock: bigint
  indexedBlockHash: Hex | null
  indexingErrors: boolean
}

export interface GraphGateway {
  health(signal?: AbortSignal): Promise<GraphHealth>
  candidates(
    marketId: Hex,
    side: 'sell' | 'buy',
    signal?: AbortSignal,
  ): Promise<IndexedMarketSnapshot>
}

export interface RouteRequest {
  marketId: Hex
  side: 'sell' | 'buy'
  kind: 'exact-input' | 'exact-output'
  /** Caller-fixed raw token amount. */
  amount: bigint
  slippageBps: number
  payer: Address
  recipient: Address
  refundRecipient: Address
  deadlineSeconds: number
}

export interface PreparedFill {
  index: number
  positionId: Hex
  positionKey: Hex
  maker: Address
  strategyHash: Hex
  expectedVersion: bigint
  fixedAmountRaw: bigint
  amountInRaw: bigint
  amountOutRaw: bigint
  nativeRateBeforeWad: bigint
  nativeRateAfterWad: bigint
  displayedPriceBeforeWad: bigint
  displayedPriceAfterWad: bigint
  displayedEffectivePriceWad: bigint
}

export interface PreparedRoute {
  routeId: Hex
  marketId: Hex
  side: 'sell' | 'buy'
  kind: 'exact-input' | 'exact-output'
  indexedBlock: bigint
  chainHeadBlock: bigint
  indexLag: bigint
  amountInRaw: bigint
  amountOutRaw: bigint
  limitRaw: bigint
  deadline: number
  fills: PreparedFill[]
  transaction: {
    to: Address
    data: Hex
    value: 0n
  }
  simulation: {
    status: 'success' | 'not-run'
    gasEstimate: bigint | null
    blockNumber: bigint | null
  }
  certificate: RouteCertificate
}

export interface ChainHealth {
  chainId: number
  headBlock: bigint
}

export interface ChainGateway {
  health(): Promise<ChainHealth>
  refreshCandidates(candidates: readonly SolverCandidate[]): Promise<SolverCandidate[]>
  prepareRoute(
    request: RouteRequest,
    market: IndexedMarketSnapshot,
    certificate: RouteCertificate,
    headBlock: bigint,
    simulate: boolean,
  ): Promise<PreparedRoute>
}

export interface ServiceConfig {
  chainId: number
  maxFills: number
  reserveCount: number
  maxIndexLag: bigint
}
