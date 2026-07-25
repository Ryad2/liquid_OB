import type { CompiledCurve, CurveDraft, CurveSide, PositionConfig, PositionDraft } from './types.js'
import { WAD } from './types.js'

const WAD_NUMBER = 1e18
const INT128_MIN = -(1n << 127n)
const INT128_MAX = (1n << 127n) - 1n
const UINT128_MAX = (1n << 128n) - 1n

export function compileCurve(draft: CurveDraft, side: CurveSide): CompiledCurve {
  validateDraft(draft, side)

  const flat = draft.startPriceWad === draft.endPriceWad
  const alphaWad = flat ? 0n : draft.alphaWad
  const alphaNativeWad = side === 'sell' ? -alphaWad : alphaWad
  const pHighWad = side === 'buy' ? draft.startPriceWad : (WAD * WAD) / draft.startPriceWad
  const pLowWad = side === 'buy' ? draft.endPriceWad : (WAD * WAD) / draft.endPriceWad

  if (flat) {
    return {
      ...draft,
      alphaWad,
      branch: 'flat',
      alphaNativeWad: 0n,
      betaNativeWad: -WAD,
      pLowWad: pHighWad,
      pHighWad,
      muWad: 0n,
      kappaWad: pHighWad,
    }
  }

  const alpha = toReal(alphaNativeWad)
  const high = toReal(pHighWad)
  const low = toReal(pLowWad)
  const mu = alpha === 0
    ? Math.log(high / low)
    : alpha > 0
      ? 1 - Math.pow(low / high, alpha)
      : 1 - Math.pow(high / low, alpha)

  const branch = alphaNativeWad === 0n
    ? 'native-alpha-zero'
    : alphaNativeWad === WAD
      ? 'native-alpha-one'
      : 'general'
  const gamma = alpha === 0 || alpha === 1 ? 0 : Math.abs((alpha - 1) / alpha)
  const kappa = alpha === 1
    ? mu * high
    : alpha === 0
      ? mu * low
      : mu * gamma * (alpha > 0 ? high : low)

  return {
    ...draft,
    alphaWad,
    branch,
    alphaNativeWad,
    betaNativeWad: alphaNativeWad - WAD,
    pLowWad,
    pHighWad,
    muWad: toWad(mu),
    kappaWad: toWad(kappa),
  }
}

export function compilePosition(draft: PositionDraft): PositionConfig {
  if (draft.baseToken.toLowerCase() === draft.quoteToken.toLowerCase()) {
    throw new Error('Base and quote token must differ')
  }
  if (draft.sell.initialReserveWad === 0n && draft.buy.initialReserveWad === 0n) {
    throw new Error('At least one side must contain inventory')
  }

  return {
    ...draft,
    sell: compileCurve(draft.sell, 'sell'),
    buy: compileCurve(draft.buy, 'buy'),
  }
}

function validateDraft(draft: CurveDraft, side: CurveSide): void {
  if (draft.startPriceWad <= 0n || draft.endPriceWad <= 0n) throw new Error('Prices must be positive')
  if (draft.startPriceWad > UINT128_MAX || draft.endPriceWad > UINT128_MAX) throw new Error('Price exceeds uint128')
  if (draft.initialReserveWad < 0n || draft.initialReserveWad > UINT128_MAX) throw new Error('Reserve exceeds uint128')
  if (draft.alphaWad <= INT128_MIN || draft.alphaWad > INT128_MAX) throw new Error('Alpha exceeds int128')
  if (side === 'sell' && draft.startPriceWad > draft.endPriceWad) {
    throw new Error('Sell start price must be lower than or equal to end price')
  }
  if (side === 'buy' && draft.startPriceWad < draft.endPriceWad) {
    throw new Error('Buy start price must be greater than or equal to end price')
  }
}

export function toReal(valueWad: bigint): number {
  return Number(valueWad) / WAD_NUMBER
}

export function toWad(value: number): bigint {
  if (!Number.isFinite(value) || value < 0) throw new Error('Value cannot be represented as unsigned WAD')
  return BigInt(Math.round(value * WAD_NUMBER))
}
