import { describe, expect, it } from 'vitest'
import { keccak256, size, stringToHex } from 'viem'

import {
  WAD,
  buildPositionStrategy,
  compileCurve,
  compilePosition,
  encodeExpectedVersion,
  encodePositionPayload,
  initialRuntime,
  quoteExactInput,
  quoteExactOutput,
  transitionPosition,
  type PositionConfig,
} from './index.js'

const BASE = '0x1111111111111111111111111111111111111111'
const QUOTE = '0x2222222222222222222222222222222222222222'
const MAKER = '0x3333333333333333333333333333333333333333'

describe('curve compiler and preview', () => {
  it('compiles all executable branch families', () => {
    const expected = ['general', 'native-alpha-one', 'general', 'native-alpha-zero', 'general']
    const alphas = [2n * WAD, WAD, WAD / 2n, 0n, -2n * WAD]

    expect(alphas.map((alphaWad) => compileCurve({
      startPriceWad: 200n * WAD,
      endPriceWad: 100n * WAD,
      alphaWad,
      initialReserveWad: 1_000n * WAD,
    }, 'buy').branch)).toEqual(expected)
  })

  it('keeps exact-input and exact-output previews aligned', () => {
    const curve = compileCurve({
      startPriceWad: 200n * WAD,
      endPriceWad: 100n * WAD,
      alphaWad: 2n * WAD,
      initialReserveWad: 1_000n * WAD,
    }, 'buy')
    const state = { yWad: 1_000n * WAD, yIntWad: 1_000n * WAD }
    const exactOutput = quoteExactOutput(curve, 'buy', state, 100n * WAD)
    const exactInput = quoteExactInput(curve, 'buy', state, exactOutput.amountInWad)

    expect(abs(exactInput.amountOutWad - 100n * WAD)).toBeLessThan(1_000_000n)
    expect(exactOutput.displayedPriceAfterWad).toBeLessThan(exactOutput.displayedPriceBeforeWad)
  })

  it('recycles incoming inventory into the opposite side', () => {
    const config = compiledPosition()
    const runtime = initialRuntime(config)
    const quote = quoteExactOutput(config.sell, 'sell', runtime.sell, WAD)
    const after = transitionPosition(runtime, 'sell', quote)

    expect(after.version).toBe(1n)
    expect(after.sell.yWad).toBe(runtime.sell.yWad - WAD)
    expect(after.buy.yWad).toBe(runtime.buy.yWad + quote.amountInWad)
  })
})

describe('canonical wire encoding', () => {
  it('matches the committed Solidity payload vector byte-for-byte', () => {
    const payload = encodePositionPayload(codecFixture())

    expect(size(payload)).toBe(269)
    expect(keccak256(payload)).toBe('0x545e5548b93c30a5c4aeefdd59d90941e754c725f5a8df1f212265055fe6ab07')
  })

  it('builds the payload-prefixed Aqua/SwapVM strategy', () => {
    const result = buildPositionStrategy(compiledPosition(), MAKER, 33)

    expect(size(result.payload)).toBe(269)
    expect(size(result.order.data)).toBe(271)
    expect(result.order.data.endsWith('2100')).toBe(true)
    expect((result.order.traits >> 208n) & 0xffffn).toBe(269n)
    expect(result.strategyHash).toBe(keccak256(result.encodedOrder))
    expect(encodeExpectedVersion(7n)).toBe('0x0000000000000007')
  })
})

function compiledPosition(): PositionConfig {
  return compilePosition({
    baseToken: BASE,
    quoteToken: QUOTE,
    salt: keccak256(stringToHex('sdk-position')),
    sell: {
      startPriceWad: 100n * WAD,
      endPriceWad: 200n * WAD,
      alphaWad: 2n * WAD,
      initialReserveWad: 5n * WAD,
    },
    buy: {
      startPriceWad: 99n * WAD,
      endPriceWad: 50n * WAD,
      alphaWad: -WAD,
      initialReserveWad: 500n * WAD,
    },
  })
}

function codecFixture(): PositionConfig {
  const curveDefaults = {
    branch: 'general' as const,
    alphaNativeWad: 0n,
    betaNativeWad: 0n,
    pLowWad: 1n,
    pHighWad: 1n,
  }
  return {
    baseToken: BASE,
    quoteToken: QUOTE,
    salt: keccak256(stringToHex('liquid-ob-phase-2-vector')),
    sell: {
      ...curveDefaults,
      startPriceWad: 100n * WAD,
      endPriceWad: 200n * WAD,
      alphaWad: 2n * WAD,
      initialReserveWad: 5n * WAD,
      muWad: 75n * WAD / 100n,
      kappaWad: WAD / 100n,
    },
    buy: {
      ...curveDefaults,
      startPriceWad: 99n * WAD,
      endPriceWad: 50n * WAD,
      alphaWad: -WAD,
      initialReserveWad: 5_000n * WAD,
      muWad: WAD / 2n,
      kappaWad: 50n * WAD,
    },
  }
}

function abs(value: bigint): bigint {
  return value < 0n ? -value : value
}
