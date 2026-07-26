import type { LiquidOBGateway, RouteInput } from '../liquid-ob-client.js'
import type { Market, Position, PreparedRoute } from '../schemas.js'
import type { StandardDexGateway, StandardDexSnapshot } from '../standard-dex.js'

export const MARKET_ID = `0x${'11'.repeat(32)}`
export const POSITION_ID = `0x${'22'.repeat(32)}`
export const MAKER = `0x${'33'.repeat(20)}`
export const PAYER = `0x${'44'.repeat(20)}`
export const BASE = `0x${'55'.repeat(20)}`
export const QUOTE = `0x${'66'.repeat(20)}`

const baseToken = { address: BASE, chainId: 84532, symbol: 'BASE', name: 'Base', decimals: 18 }
const quoteToken = { address: QUOTE, chainId: 84532, symbol: 'QUOTE', name: 'Quote', decimals: 6 }
const meta = {
  mode: 'live' as const,
  source: 'composed',
  generatedAt: '2026-07-26T00:00:00.000Z',
  chainHeadBlock: 105,
  indexedBlock: 103,
  indexLag: 2,
  stale: false,
  warnings: [],
}

export const market: Market = {
  id: MARKET_ID,
  baseToken,
  quoteToken,
  bestBid: null,
  bestAsk: null,
  spreadBps: null,
  stats: {
    activePositions: 1,
    activeSellSides: 1,
    activeBuySides: 1,
    fillCount24h: 0,
    volumeQuote24h: { token: quoteToken, raw: '0', formatted: '0' },
  },
  lastUpdateBlock: 103,
  recentRouteIds: [],
  meta,
}

function curve(side: 'sell' | 'buy') {
  const output = side === 'sell' ? baseToken : quoteToken
  return {
    policy: {
      side,
      branch: 'general',
      startPrice: { baseToken: BASE, quoteToken: QUOTE, wad: '1000000000000000000', formatted: '1' },
      endPrice: { baseToken: BASE, quoteToken: QUOTE, wad: '2000000000000000000', formatted: '2' },
      alpha: '2',
      alphaWad: '2000000000000000000',
      initialReserve: { token: output, raw: '1000', formatted: '0.001' },
    },
    runtime: {
      yWad: '1000000000000000000',
      yIntWad: '1000000000000000000',
      progressBps: 0,
      availableOutput: { token: output, raw: '1000', formatted: '0.001' },
      currentMarginalPrice: { baseToken: BASE, quoteToken: QUOTE, wad: '1000000000000000000', formatted: '1' },
      backingStatus: 'backed',
    },
  }
}

export const position: Position = {
  id: POSITION_ID,
  positionKey: `0x${'77'.repeat(32)}`,
  strategyHash: `0x${'88'.repeat(32)}`,
  marketId: MARKET_ID,
  maker: MAKER,
  lifecycle: 'active',
  runtimeVersion: 1,
  sell: curve('sell'),
  buy: curve('buy'),
  sufficientlyBacked: true,
  lastUpdateBlock: 103,
}

export const route: PreparedRoute = {
  routeId: `0x${'99'.repeat(32)}`,
  marketId: MARKET_ID,
  side: 'sell',
  kind: 'exact-input',
  indexedBlock: '103',
  chainHeadBlock: '105',
  indexLag: '2',
  amountInRaw: '100',
  amountOutRaw: '90',
  limitRaw: '89',
  deadline: 2_000_000_000,
  fills: [{
    index: 0,
    positionId: POSITION_ID,
    maker: MAKER,
    expectedVersion: '1',
    amountInRaw: '100',
    amountOutRaw: '90',
    displayedEffectivePriceWad: '1111111111111111111',
  }],
  transaction: { to: `0x${'aa'.repeat(20)}`, data: '0x1234', value: '0' },
  simulation: { status: 'success', gasEstimate: '300000', blockNumber: '105' },
}

export class FakeLiquidOB implements LiquidOBGateway {
  async market(): Promise<Market> { return market }
  async activePositions() { return { items: [position], indexedBlock: 103, chainHeadBlock: 105, indexLag: 2, stale: false, warnings: [] } }
  async quote(input: RouteInput, simulate: boolean): Promise<PreparedRoute> {
    return {
      ...route,
      side: input.side,
      kind: input.kind,
      amountInRaw: input.kind === 'exact-input' ? input.amount : '112',
      amountOutRaw: input.kind === 'exact-output' ? input.amount : '90',
      simulation: simulate ? route.simulation : { status: 'not-run', gasEstimate: null, blockNumber: null },
    }
  }
  async health() { return { status: 'healthy', indexedBlock: '103' } }
}

export class FakeDex implements StandardDexGateway {
  async compare(): Promise<StandardDexSnapshot> {
    return {
      configured: true,
      venue: 'Example V2',
      model: 'constant-product-v2',
      indexedBlock: 102,
      hasIndexingErrors: false,
      tokenIn: QUOTE,
      tokenOut: BASE,
      pools: [],
      bestEstimate: { poolId: 'pool', amountInRaw: '100', amountOutRaw: '80' },
      executionStatus: 'indexed-estimate-only',
      caveats: ['Indexed estimate only'],
    }
  }
}
