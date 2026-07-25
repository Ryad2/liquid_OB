import { FrontendGatewayError } from './errors.js'
import type {
  DecimalString,
  RawAmount,
  SignedWadInteger,
  Token,
  TokenAmount,
  WadInteger,
} from './types.js'

const DECIMAL_PATTERN = /^\d+(?:\.\d+)?$/
const SIGNED_DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/
const RAW_PATTERN = /^\d+$/

export function parseUnits(value: DecimalString, decimals: number): RawAmount {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new FrontendGatewayError('INVALID_ARGUMENT', 'Token decimals are invalid.')
  }

  const normalized = value.trim()
  if (!DECIMAL_PATTERN.test(normalized)) {
    throw new FrontendGatewayError(
      'INVALID_AMOUNT',
      'Enter a non-negative decimal amount without exponent notation.',
    )
  }

  const [whole = '0', fraction = ''] = normalized.split('.')
  if (fraction.length > decimals) {
    throw new FrontendGatewayError(
      'INVALID_AMOUNT',
      `This token supports at most ${decimals} decimal places.`,
    )
  }

  const paddedFraction = fraction.padEnd(decimals, '0')
  const raw = BigInt(`${whole}${paddedFraction}` || '0')
  return raw.toString() as RawAmount
}

export function formatUnits(
  raw: RawAmount,
  decimals: number,
  maximumFractionDigits = decimals,
): DecimalString {
  if (!RAW_PATTERN.test(raw)) {
    throw new FrontendGatewayError('INVALID_AMOUNT', 'Raw token amount must be unsigned.')
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new FrontendGatewayError('INVALID_ARGUMENT', 'Token decimals are invalid.')
  }

  const boundedDigits = Math.max(0, Math.min(maximumFractionDigits, decimals))
  const padded = raw.padStart(decimals + 1, '0')
  const whole = decimals === 0 ? padded : padded.slice(0, -decimals)
  if (boundedDigits === 0) return whole

  const fraction = padded
    .slice(-decimals)
    .slice(0, boundedDigits)
    .replace(/0+$/, '')
  return fraction.length === 0 ? whole : `${whole}.${fraction}`
}

export function tokenAmount(
  token: Token,
  raw: RawAmount,
  maximumFractionDigits = Math.min(token.decimals, 6),
): TokenAmount {
  return {
    token,
    raw,
    formatted: formatUnits(raw, token.decimals, maximumFractionDigits),
  }
}

export function parseWad(value: DecimalString): WadInteger {
  return parseUnits(value, 18) as WadInteger
}

export function parseSignedWad(value: DecimalString): SignedWadInteger {
  const normalized = value.trim()
  if (!SIGNED_DECIMAL_PATTERN.test(normalized)) {
    throw new FrontendGatewayError(
      'INVALID_AMOUNT',
      'Enter a signed decimal value without exponent notation.',
    )
  }

  const negative = normalized.startsWith('-')
  const magnitude = parseUnits(negative ? normalized.slice(1) : normalized, 18)
  const encoded = negative ? -BigInt(magnitude) : BigInt(magnitude)
  return encoded.toString() as SignedWadInteger
}

export function formatWad(wad: WadInteger, maximumFractionDigits = 6): DecimalString {
  return formatUnits(wad as RawAmount, 18, maximumFractionDigits)
}

export function mulDivDown(left: bigint, right: bigint, denominator: bigint): bigint {
  if (left < 0n || right < 0n || denominator <= 0n) {
    throw new FrontendGatewayError(
      'INVALID_ARGUMENT',
      'Unsigned mulDiv requires non-negative operands and a positive denominator.',
    )
  }
  return (left * right) / denominator
}

export function mulDivUp(left: bigint, right: bigint, denominator: bigint): bigint {
  if (left < 0n || right < 0n || denominator <= 0n) {
    throw new FrontendGatewayError(
      'INVALID_ARGUMENT',
      'Unsigned mulDiv requires non-negative operands and a positive denominator.',
    )
  }
  const product = left * right
  return product === 0n ? 0n : ((product - 1n) / denominator) + 1n
}

export function rawToWad(raw: RawAmount, tokenDecimals: number): bigint {
  if (!Number.isInteger(tokenDecimals) || tokenDecimals < 0 || tokenDecimals > 18) {
    throw new FrontendGatewayError(
      'INVALID_ARGUMENT',
      'Liquid OB MVP supports token decimals up to 18.',
    )
  }
  return BigInt(raw) * (10n ** BigInt(18 - tokenDecimals))
}

export function wadToRawDown(wad: bigint, tokenDecimals: number): RawAmount {
  if (wad < 0n || !Number.isInteger(tokenDecimals)
    || tokenDecimals < 0 || tokenDecimals > 18) {
    throw new FrontendGatewayError(
      'INVALID_ARGUMENT',
      'Liquid OB MVP supports token decimals up to 18.',
    )
  }
  return (wad / (10n ** BigInt(18 - tokenDecimals))).toString() as RawAmount
}

export function wadToRawUp(wad: bigint, tokenDecimals: number): RawAmount {
  if (wad < 0n || !Number.isInteger(tokenDecimals)
    || tokenDecimals < 0 || tokenDecimals > 18) {
    throw new FrontendGatewayError(
      'INVALID_ARGUMENT',
      'Liquid OB MVP supports token decimals up to 18.',
    )
  }
  const scale = 10n ** BigInt(18 - tokenDecimals)
  return (wad === 0n ? 0n : ((wad - 1n) / scale) + 1n).toString() as RawAmount
}
