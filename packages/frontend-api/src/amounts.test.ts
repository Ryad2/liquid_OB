import { describe, expect, it } from 'vitest'
import {
  FrontendGatewayError,
  formatUnits,
  mulDivDown,
  mulDivUp,
  parseSignedWad,
  parseUnits,
  rawToWad,
  wadToRawDown,
  wadToRawUp,
} from './index.js'

describe('frontend amount boundary', () => {
  it('round-trips token-native decimal strings without Number arithmetic', () => {
    expect(parseUnits('1234.56789', 6)).toBe('1234567890')
    expect(formatUnits('1234567890', 6)).toBe('1234.56789')
    expect(parseSignedWad('-1.5')).toBe('-1500000000000000000')
  })

  it('rejects ambiguous precision instead of silently rounding user input', () => {
    expect(() => parseUnits('1.0000001', 6)).toThrow(FrontendGatewayError)
    expect(() => parseUnits('1e3', 6)).toThrow(FrontendGatewayError)
  })

  it('exposes directional arithmetic and token conversion explicitly', () => {
    expect(mulDivDown(10n, 10n, 6n)).toBe(16n)
    expect(mulDivUp(10n, 10n, 6n)).toBe(17n)
    expect(rawToWad('1000001', 6)).toBe(1_000_001n * (10n ** 12n))
    expect(wadToRawDown(1_000_000_000_000_000_001n, 6)).toBe('1000000')
    expect(wadToRawUp(1_000_000_000_000_000_001n, 6)).toBe('1000001')
    expect(() => mulDivDown(-1n, 1n, 1n)).toThrow(FrontendGatewayError)
    expect(() => wadToRawDown(-1n, 6)).toThrow(FrontendGatewayError)
  })
})
