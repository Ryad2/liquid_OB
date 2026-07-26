import { formatWad, parseWad } from '../amounts.js'
import type {
  Address,
  CurveBranch,
  CurveSample,
  CurveSide,
  DecimalString,
  DisplayPrice,
} from '../types.js'

function cleanDecimal(value: number, fractionDigits = 18): DecimalString {
  if (!Number.isFinite(value)) return '0'
  if (Math.abs(value) >= 1e21) {
    return value.toLocaleString('en-US', {
      maximumFractionDigits: 0,
      useGrouping: false,
    }) as DecimalString
  }
  return value.toFixed(fractionDigits).replace(/\.?0+$/, '')
}

export function displayedPrice(
  baseToken: Address,
  quoteToken: Address,
  value: DecimalString,
): DisplayPrice {
  const wad = parseWad(value)
  return {
    baseToken,
    quoteToken,
    wad,
    formatted: formatWad(wad, 18),
  }
}

export function inferBranch(
  side: CurveSide,
  startPrice: DecimalString,
  endPrice: DecimalString,
  alpha: DecimalString,
): CurveBranch {
  if (Number(startPrice) === Number(endPrice)) return 'flat'
  const alphaNumber = Number(alpha)
  const nativeAlpha = side === 'sell' ? -alphaNumber : alphaNumber
  if (nativeAlpha === 0) return 'native-alpha-zero'
  if (nativeAlpha === 1) return 'native-alpha-one'
  return 'general'
}

/** Visual-only Holder marginal schedule used by the mock adapter. */
export function holderPrice(
  startPrice: number,
  endPrice: number,
  alpha: number,
  progress: number,
): number {
  if (startPrice === endPrice) return startPrice
  if (progress <= 0) return startPrice
  if (progress >= 1) return endPrice
  if (Math.abs(alpha) < 1e-7) {
    return Math.exp(
      ((1 - progress) * Math.log(startPrice))
      + (progress * Math.log(endPrice)),
    )
  }
  const relativePower = alpha * Math.log(endPrice / startPrice)
  const firstTerm = Math.log1p(-progress)
  const secondTerm = Math.log(progress) + relativePower
  const maximum = Math.max(firstTerm, secondTerm)
  const logWeightedPower = maximum + Math.log(
    Math.exp(firstTerm - maximum) + Math.exp(secondTerm - maximum),
  )
  return Math.exp(Math.log(startPrice) + (logWeightedPower / alpha))
}

export function marginalSamples(options: {
  baseToken: Address
  quoteToken: Address
  startPrice: DecimalString
  endPrice: DecimalString
  alpha: DecimalString
  initialReserve: DecimalString
  points?: number
}): CurveSample[] {
  const points = options.points ?? 21
  const start = Number(options.startPrice)
  const end = Number(options.endPrice)
  const alpha = Number(options.alpha)
  const reserve = Number(options.initialReserve)

  return Array.from({ length: points }, (_, index) => {
    const progress = points === 1 ? 0 : index / (points - 1)
    const price = cleanDecimal(holderPrice(start, end, alpha, progress))
    const remainingReserve = cleanDecimal(reserve * (1 - progress))
    return {
      progressBps: Math.round(progress * 10_000),
      displayedMarginalPrice: displayedPrice(
        options.baseToken,
        options.quoteToken,
        price,
      ),
      remainingReserve,
    }
  })
}
