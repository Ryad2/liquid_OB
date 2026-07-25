import { WAD, compileCurve, type CurveDraft, type CurveSide } from '@liquid-ob/curve-math'
import type { RouteCertificate, SolverCandidate } from '@liquid-ob/solver-core'
import { toHex, type Address, type Hex } from 'viem'

import type { IndexedMarketSnapshot, PreparedRoute, RouteRequest } from '../types.js'

export const MARKET = toHex(1n, { size: 32 })
export const MAKER = '0x0000000000000000000000000000000000000001' as Address
export const PAYER = '0x0000000000000000000000000000000000000002' as Address
export const BASE = '0x0000000000000000000000000000000000000010' as Address
export const QUOTE = '0x0000000000000000000000000000000000000020' as Address

export function candidate(
  index: number,
  side: CurveSide = 'buy',
  draft: CurveDraft = flat(2n * WAD, 10n * WAD),
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
    expectedVersion: 1n,
    indexedBlock: 10n,
    active: true,
    sufficientlyBacked: true,
    ...overrides,
  }
}

export function flat(price: bigint, reserve: bigint): CurveDraft {
  return { startPriceWad: price, endPriceWad: price, alphaWad: 0n, initialReserveWad: reserve }
}

export function market(candidates: SolverCandidate[], indexedBlock = 10n): IndexedMarketSnapshot {
  return {
    marketId: MARKET,
    baseToken: { address: BASE, symbol: 'BASE', name: 'Base', decimals: 18 },
    quoteToken: { address: QUOTE, symbol: 'QUOTE', name: 'Quote', decimals: 18 },
    indexedBlock,
    indexedBlockHash: toHex(indexedBlock, { size: 32 }),
    indexingErrors: false,
    candidates,
  }
}

export function request(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    marketId: MARKET,
    side: 'buy',
    kind: 'exact-input',
    amount: WAD,
    slippageBps: 50,
    payer: PAYER,
    recipient: PAYER,
    refundRecipient: PAYER,
    deadlineSeconds: 600,
    ...overrides,
  }
}

export function prepared(certificate: RouteCertificate): PreparedRoute {
  return {
    routeId: toHex(900n, { size: 32 }),
    marketId: certificate.marketId,
    side: certificate.side,
    kind: certificate.kind,
    indexedBlock: certificate.snapshotBlock,
    chainHeadBlock: 12n,
    indexLag: 2n,
    amountInRaw: certificate.amountInWad,
    amountOutRaw: certificate.amountOutWad,
    limitRaw: certificate.amountOutWad,
    deadline: 1_800_000_000,
    fills: [],
    transaction: { to: MAKER, data: '0x', value: 0n },
    simulation: { status: 'not-run', gasEstimate: null, blockNumber: null },
    certificate,
  }
}

export function hex(value: bigint): Hex {
  return toHex(value, { size: 32 })
}
