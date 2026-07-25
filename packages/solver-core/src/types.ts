import type {
  CompiledCurve,
  CurveQuote,
  CurveSide,
  CurveState,
  QuoteKind,
} from '@liquid-ob/curve-math'
import type { Address, Hex } from 'viem'

export interface SolverCandidate {
  id: Hex
  positionKey: Hex
  marketId: Hex
  maker: Address
  strategyHash: Hex
  strategy: Hex
  side: CurveSide
  curve: CompiledCurve
  state: CurveState
  expectedVersion: bigint
  indexedBlock: bigint
  active: boolean
  sufficientlyBacked: boolean
}

export interface SolveRequest {
  marketId: Hex
  side: CurveSide
  kind: QuoteKind
  /** Fixed WAD amount: input for exact-input, output for exact-output. */
  amountWad: bigint
  maxFills: number
  snapshotBlock: bigint
  candidates: readonly SolverCandidate[]
  reserveCount?: number
}

export interface SolverFill {
  index: number
  candidate: SolverCandidate
  /** Fixed WAD amount: input for exact-input, output for exact-output. */
  amountWad: bigint
  quote: CurveQuote
}

export interface ReserveCandidate {
  id: Hex
  positionKey: Hex
  expectedVersion: bigint
  nativeRateWad: bigint
}

export type RejectionCode =
  | 'inactive'
  | 'unbacked'
  | 'exhausted'
  | 'wrong-market'
  | 'wrong-side'
  | 'invalid-curve'

export interface RejectedCandidate {
  id: Hex
  code: RejectionCode
  message: string
}

export interface RouteCertificate {
  marketId: Hex
  side: CurveSide
  kind: QuoteKind
  snapshotBlock: bigint
  fixedAmountWad: bigint
  amountInWad: bigint
  amountOutWad: bigint
  fills: SolverFill[]
  reserveCandidates: ReserveCandidate[]
  rejectedCandidates: RejectedCandidate[]
}

export type SolverErrorCode =
  | 'invalid-request'
  | 'duplicate-candidate'
  | 'insufficient-liquidity'
  | 'max-fills-exceeded'

export class SolverError extends Error {
  readonly code: SolverErrorCode

  constructor(code: SolverErrorCode, message: string) {
    super(message)
    this.name = 'SolverError'
    this.code = code
  }
}
