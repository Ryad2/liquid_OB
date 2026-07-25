import type { Address, Hex } from 'viem'

export const WAD = 10n ** 18n

export type CurveSide = 'sell' | 'buy'
export type CurveBranch = 'general' | 'native-alpha-zero' | 'native-alpha-one' | 'flat'
export type QuoteKind = 'exact-input' | 'exact-output'

export interface CurveDraft {
  startPriceWad: bigint
  endPriceWad: bigint
  alphaWad: bigint
  initialReserveWad: bigint
}

export interface CompiledCurve extends CurveDraft {
  branch: CurveBranch
  alphaNativeWad: bigint
  betaNativeWad: bigint
  pLowWad: bigint
  pHighWad: bigint
  muWad: bigint
  kappaWad: bigint
}

export interface PositionDraft {
  baseToken: Address
  quoteToken: Address
  salt: Hex
  sell: CurveDraft
  buy: CurveDraft
}

export interface PositionConfig extends Omit<PositionDraft, 'sell' | 'buy'> {
  sell: CompiledCurve
  buy: CompiledCurve
}

export interface CurveState {
  yWad: bigint
  yIntWad: bigint
}

export interface PositionRuntime {
  sell: CurveState
  buy: CurveState
  version: bigint
  initialized: boolean
}

export interface CurveQuote {
  kind: QuoteKind
  side: CurveSide
  amountInWad: bigint
  amountOutWad: bigint
  nativeRateBeforeWad: bigint
  nativeRateAfterWad: bigint
  nativeEffectiveRateWad: bigint
  displayedPriceBeforeWad: bigint
  displayedPriceAfterWad: bigint
  displayedEffectivePriceWad: bigint
  activeBefore: CurveState
  activeAfter: CurveState
}

export interface SwapVmOrder {
  maker: Address
  traits: bigint
  data: Hex
}

export interface PositionStrategy {
  payload: Hex
  order: SwapVmOrder
  encodedOrder: Hex
  strategyHash: Hex
}
