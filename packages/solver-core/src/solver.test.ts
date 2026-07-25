import {
  WAD,
  compileCurve,
  quoteExactInput,
  quoteExactOutput,
  type CurveDraft,
  type CurveSide,
} from '@liquid-ob/curve-math'
import { describe, expect, it } from 'vitest'
import { toHex } from 'viem'

import { solveRoute } from './solver.js'
import { SolverError, type SolverCandidate } from './types.js'

const MARKET = toHex(1n, { size: 32 })
const MAKER = '0x0000000000000000000000000000000000000001'

function candidate(
  index: number,
  side: CurveSide,
  draft: CurveDraft,
  overrides: Partial<SolverCandidate> = {},
): SolverCandidate {
  const id = toHex(BigInt(index), { size: 32 })
  return {
    id,
    positionKey: id,
    marketId: MARKET,
    maker: MAKER,
    strategyHash: toHex(BigInt(index + 100), { size: 32 }),
    strategy: '0x00',
    side,
    curve: compileCurve(draft, side),
    state: { yWad: draft.initialReserveWad, yIntWad: draft.initialReserveWad },
    expectedVersion: 0n,
    indexedBlock: 10n,
    active: true,
    sufficientlyBacked: true,
    ...overrides,
  }
}

function flat(price: bigint, reserve: bigint): CurveDraft {
  return { startPriceWad: price, endPriceWad: price, alphaWad: 0n, initialReserveWad: reserve }
}

function solve(kind: 'exact-input' | 'exact-output', amountWad: bigint, candidates: SolverCandidate[], maxFills = 8) {
  return solveRoute({
    marketId: MARKET,
    side: 'buy',
    kind,
    amountWad,
    maxFills,
    snapshotBlock: 10n,
    candidates,
  })
}

describe('deterministic solver core', () => {
  it('fills better flat levels first and splits only at capacity', () => {
    const result = solve('exact-input', 3n * WAD, [
      candidate(1, 'buy', flat(3n * WAD, 6n * WAD)),
      candidate(2, 'buy', flat(2n * WAD, 10n * WAD)),
    ])

    expect(result.fills.map((fill) => fill.amountWad)).toEqual([2n * WAD, 1n * WAD])
    expect(result.amountOutWad).toBe(8n * WAD)
    expect(result.fills.every((fill) => fill.quote.kind === 'exact-input')).toBe(true)
  })

  it('minimizes exact-output input over the same flat book', () => {
    const result = solve('exact-output', 8n * WAD, [
      candidate(1, 'buy', flat(3n * WAD, 6n * WAD)),
      candidate(2, 'buy', flat(2n * WAD, 10n * WAD)),
    ])

    expect(result.fills.map((fill) => fill.amountWad)).toEqual([6n * WAD, 2n * WAD])
    expect(result.amountInWad).toBe(3n * WAD)
  })

  it('uses the position key as a stable tie break', () => {
    const first = candidate(1, 'buy', flat(2n * WAD, 10n * WAD))
    const second = candidate(2, 'buy', flat(2n * WAD, 10n * WAD))
    const result = solve('exact-input', 2n * WAD, [second, first])

    expect(result.fills).toHaveLength(1)
    expect(result.fills[0]!.candidate.positionKey).toBe(first.positionKey)
  })

  it('matches a grid brute-force oracle for curved candidates', () => {
    const candidates = [
      candidate(1, 'buy', {
        startPriceWad: 4n * WAD,
        endPriceWad: 1n * WAD,
        alphaWad: 0n,
        initialReserveWad: 8n * WAD,
      }),
      candidate(2, 'buy', {
        startPriceWad: 3n * WAD,
        endPriceWad: 2n * WAD,
        alphaWad: WAD,
        initialReserveWad: 8n * WAD,
      }),
    ]
    const target = 2n * WAD
    const result = solve('exact-input', target, candidates)
    let bruteForceBest = 0n
    const step = WAD / 100n
    for (let left = 0n; left <= target; left += step) {
      try {
        const leftOut = left === 0n ? 0n : quoteExactInput(candidates[0]!.curve, 'buy', candidates[0]!.state, left).amountOutWad
        const right = target - left
        const rightOut = right === 0n ? 0n : quoteExactInput(candidates[1]!.curve, 'buy', candidates[1]!.state, right).amountOutWad
        if (leftOut + rightOut > bruteForceBest) bruteForceBest = leftOut + rightOut
      } catch {
        // This split exceeds one candidate's capacity.
      }
    }

    expect(result.amountOutWad).toBeGreaterThanOrEqual(bruteForceBest - (WAD / 10_000n))
  })

  it('compresses to maxFills by removing the least valuable venue', () => {
    const result = solve('exact-input', WAD, [
      candidate(1, 'buy', flat(4n * WAD, 10n * WAD)),
      candidate(2, 'buy', flat(3n * WAD, 10n * WAD)),
      candidate(3, 'buy', flat(2n * WAD, 10n * WAD)),
    ], 1)

    expect(result.fills).toHaveLength(1)
    expect(result.amountOutWad).toBe(4n * WAD)
  })

  it('filters unsafe candidates and exposes reserve candidates', () => {
    const good = candidate(1, 'buy', flat(2n * WAD, 10n * WAD))
    const inactive = candidate(2, 'buy', flat(3n * WAD, 10n * WAD), { active: false })
    const reserve = candidate(3, 'buy', flat(WAD, 10n * WAD))
    const result = solve('exact-input', WAD, [inactive, reserve, good])

    expect(result.rejectedCandidates).toEqual([
      expect.objectContaining({ id: inactive.id, code: 'inactive' }),
    ])
    expect(result.reserveCandidates[0]!.id).toBe(reserve.id)
  })

  it('fails safely when liquidity or the fill bound is insufficient', () => {
    const tiny = candidate(1, 'buy', flat(2n * WAD, WAD))
    expect(() => solve('exact-output', 2n * WAD, [tiny])).toThrow(SolverError)

    const one = candidate(1, 'buy', flat(3n * WAD, WAD))
    const two = candidate(2, 'buy', flat(2n * WAD, WAD))
    try {
      solve('exact-output', 2n * WAD, [one, two], 1)
      throw new Error('Expected max-fills failure')
    } catch (error) {
      expect(error).toBeInstanceOf(SolverError)
      expect((error as SolverError).code).toBe('max-fills-exceeded')
    }
  })

  it('agrees with direct exact-output quotes for every certificate fill', () => {
    const positions = [
      candidate(1, 'buy', flat(3n * WAD, 6n * WAD)),
      candidate(2, 'buy', flat(2n * WAD, 10n * WAD)),
    ]
    const result = solve('exact-output', 8n * WAD, positions)
    for (const fill of result.fills) {
      const expected = quoteExactOutput(fill.candidate.curve, 'buy', fill.candidate.state, fill.amountWad)
      expect(fill.quote).toEqual(expected)
    }
  })
})
