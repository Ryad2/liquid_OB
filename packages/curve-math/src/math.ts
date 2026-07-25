import { toReal, toWad } from './compiler.js'
import type {
  CompiledCurve,
  CurveQuote,
  CurveSide,
  CurveState,
  PositionConfig,
  PositionRuntime,
  QuoteKind,
} from './types.js'

export function initialRuntime(config: PositionConfig): PositionRuntime {
  return {
    sell: freshState(config.sell.initialReserveWad),
    buy: freshState(config.buy.initialReserveWad),
    version: 0n,
    initialized: false,
  }
}

export function marginalPriceWad(curve: CompiledCurve, side: CurveSide, state: CurveState): bigint {
  const rate = marginalRate(curve, state)
  return toWad(side === 'buy' ? rate : 1 / rate)
}

export function quoteExactInput(
  curve: CompiledCurve,
  side: CurveSide,
  state: CurveState,
  amountInWad: bigint,
): CurveQuote {
  if (amountInWad <= 0n) throw new Error('Amount in must be positive')
  const yBefore = toReal(state.yWad)
  const yInt = toReal(state.yIntWad)
  const xAfter = xOfY(curve, yBefore, yInt) + toReal(amountInWad)
  const yAfter = yOfX(curve, xAfter, yInt)
  return buildQuote(curve, side, 'exact-input', state, amountInWad, toWad(yBefore - yAfter), toWad(yAfter))
}

export function quoteExactOutput(
  curve: CompiledCurve,
  side: CurveSide,
  state: CurveState,
  amountOutWad: bigint,
): CurveQuote {
  if (amountOutWad <= 0n || amountOutWad > state.yWad) throw new Error('Amount out exceeds reserve')
  const yBefore = toReal(state.yWad)
  const yAfter = yBefore - toReal(amountOutWad)
  const yInt = toReal(state.yIntWad)
  const amountIn = xOfY(curve, yAfter, yInt) - xOfY(curve, yBefore, yInt)
  return buildQuote(curve, side, 'exact-output', state, toWad(amountIn), amountOutWad, toWad(yAfter))
}

export function transitionPosition(
  runtime: PositionRuntime,
  activeSide: CurveSide,
  quote: CurveQuote,
): PositionRuntime {
  if (activeSide === 'sell') {
    return {
      sell: quote.activeAfter,
      buy: credit(runtime.buy, quote.amountInWad),
      version: runtime.version + 1n,
      initialized: true,
    }
  }
  return {
    sell: credit(runtime.sell, quote.amountInWad),
    buy: quote.activeAfter,
    version: runtime.version + 1n,
    initialized: true,
  }
}

function buildQuote(
  curve: CompiledCurve,
  side: CurveSide,
  kind: QuoteKind,
  state: CurveState,
  amountInWad: bigint,
  amountOutWad: bigint,
  yAfterWad: bigint,
): CurveQuote {
  const beforeRate = marginalRate(curve, state)
  const activeAfter = { yWad: yAfterWad, yIntWad: state.yIntWad }
  const afterRate = marginalRate(curve, activeAfter)
  const effectiveRate = toReal(amountOutWad) / toReal(amountInWad)
  return {
    kind,
    side,
    amountInWad,
    amountOutWad,
    nativeRateBeforeWad: toWad(beforeRate),
    nativeRateAfterWad: toWad(afterRate),
    nativeEffectiveRateWad: toWad(effectiveRate),
    displayedPriceBeforeWad: toWad(side === 'buy' ? beforeRate : 1 / beforeRate),
    displayedPriceAfterWad: toWad(side === 'buy' ? afterRate : 1 / afterRate),
    displayedEffectivePriceWad: toWad(side === 'buy' ? effectiveRate : 1 / effectiveRate),
    activeBefore: state,
    activeAfter,
  }
}

function marginalRate(curve: CompiledCurve, state: CurveState): number {
  validateState(state)
  if (curve.branch === 'flat') return toReal(curve.kappaWad)
  const alpha = toReal(curve.alphaNativeWad)
  const mu = toReal(curve.muWad)
  const kappa = toReal(curve.kappaWad)
  const ratio = toReal(state.yWad) / toReal(state.yIntWad)
  if (alpha > 1) {
    const gamma = Math.abs((alpha - 1) / alpha)
    return kappa / (mu * gamma) * Math.pow(1 - mu * (1 - ratio), 1 - gamma)
  }
  if (alpha === 1) return kappa / mu * (1 - mu * (1 - ratio))
  if (alpha > 0) {
    const gamma = Math.abs((alpha - 1) / alpha)
    return kappa / (mu * gamma) * Math.pow(1 - mu * (1 - ratio), 1 + gamma)
  }
  if (alpha === 0) return kappa / mu * Math.exp(mu * ratio)
  const gamma = Math.abs((alpha - 1) / alpha)
  return kappa / (mu * gamma) * Math.pow(1 - mu * ratio, 1 - gamma)
}

function xOfY(curve: CompiledCurve, y: number, yInt: number): number {
  if (yInt <= 0 || y < 0 || y > yInt) throw new Error('Curve state is outside its domain')
  const kappa = toReal(curve.kappaWad)
  if (curve.branch === 'flat') return (yInt - y) / kappa
  const alpha = toReal(curve.alphaNativeWad)
  const mu = toReal(curve.muWad)
  const ratio = y / yInt
  if (alpha > 1) {
    const gamma = Math.abs((alpha - 1) / alpha)
    return yInt / kappa * (1 - Math.pow(1 - mu * (1 - ratio), gamma))
  }
  if (alpha === 1) return -yInt / kappa * Math.log(1 - mu * (1 - ratio))
  if (alpha > 0) {
    const gamma = Math.abs((alpha - 1) / alpha)
    return yInt / kappa * (Math.pow(1 - mu * (1 - ratio), -gamma) - 1)
  }
  if (alpha === 0) return yInt / kappa * (Math.exp(-mu * ratio) - Math.exp(-mu))
  const gamma = Math.abs((alpha - 1) / alpha)
  return yInt / kappa * (Math.pow(1 - mu * ratio, gamma) - Math.pow(1 - mu, gamma))
}

function yOfX(curve: CompiledCurve, x: number, yInt: number): number {
  const capacity = xOfY(curve, 0, yInt)
  if (x < 0 || x > capacity * (1 + 1e-12)) throw new Error('Input exceeds curve capacity')
  const kappa = toReal(curve.kappaWad)
  if (curve.branch === 'flat') return yInt - x * kappa
  const alpha = toReal(curve.alphaNativeWad)
  const mu = toReal(curve.muWad)
  const scaledX = kappa * x / yInt
  if (alpha > 1) {
    const gamma = Math.abs((alpha - 1) / alpha)
    return yInt / mu * (Math.pow(1 - scaledX, 1 / gamma) + mu - 1)
  }
  if (alpha === 1) return yInt / mu * (Math.exp(-scaledX) + mu - 1)
  if (alpha > 0) {
    const gamma = Math.abs((alpha - 1) / alpha)
    return yInt / mu * (Math.pow(1 + scaledX, -1 / gamma) + mu - 1)
  }
  if (alpha === 0) return -yInt / mu * Math.log(Math.exp(-mu) + scaledX)
  const gamma = Math.abs((alpha - 1) / alpha)
  return yInt / mu * (1 - Math.pow(Math.pow(1 - mu, gamma) + scaledX, 1 / gamma))
}

function freshState(reserveWad: bigint): CurveState {
  return { yWad: reserveWad, yIntWad: reserveWad }
}

function credit(state: CurveState, amountWad: bigint): CurveState {
  if (state.yWad === 0n) return { yWad: amountWad, yIntWad: amountWad }
  const yAfter = state.yWad + amountWad
  const numerator = state.yIntWad * yAfter
  return { yWad: yAfter, yIntWad: (numerator + state.yWad - 1n) / state.yWad }
}

function validateState(state: CurveState): void {
  if (state.yIntWad <= 0n || state.yWad < 0n || state.yWad > state.yIntWad) {
    throw new Error('Curve state is outside its domain')
  }
}
