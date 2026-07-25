import {
  formatWad,
  parseSignedWad,
  parseUnits,
  parseWad,
  tokenAmount,
} from '../amounts.js'
import type {
  ActivityItem,
  Address,
  AssetBackingView,
  Bytes32,
  CurveSide,
  CurveView,
  DataMeta,
  DisplayPrice,
  FrontendBootstrap,
  Hex,
  MarketDetail,
  PositionDetail,
  Token,
  WadInteger,
} from '../types.js'
import { displayedPrice, inferBranch, marginalSamples } from './model.js'

export const MOCK_CHAIN_ID = 31_337
export const MOCK_CHAIN_HEAD = 25_070_100
export const MOCK_INDEXED_BLOCK = 25_070_098
export const MOCK_TIMESTAMP = '2026-07-25T15:00:00.000Z'

export const MARKET_ID = (
  `0x${'11'.repeat(32)}`
) as Bytes32
export const ROUTE_ID = (
  `0x${'77'.repeat(32)}`
) as Bytes32

export const MAKER_A = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa' as Address
export const MAKER_B = '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB' as Address
export const MAKER_C = '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC' as Address

export const BASE_TOKEN: Token = {
  address: '0x1000000000000000000000000000000000000001',
  chainId: MOCK_CHAIN_ID,
  symbol: 'WETH',
  name: 'Mock Wrapped Ether',
  decimals: 18,
}

export const QUOTE_TOKEN: Token = {
  address: '0x2000000000000000000000000000000000000002',
  chainId: MOCK_CHAIN_ID,
  symbol: 'USDC',
  name: 'Mock USD Coin',
  decimals: 6,
}

export const MOCK_ADDRESSES = {
  aqua: '0x3000000000000000000000000000000000000003',
  swapVmRouter: '0x4000000000000000000000000000000000000004',
  liquidOBRouter: '0x5000000000000000000000000000000000000005',
  quoter: '0x6000000000000000000000000000000000000006',
  lens: '0x7000000000000000000000000000000000000007',
  batchExecutor: '0x8000000000000000000000000000000000000008',
} satisfies Record<string, Address>

export function mockMeta(
  generatedAt = MOCK_TIMESTAMP,
  source: DataMeta['source'] = 'mock',
): DataMeta {
  return {
    mode: 'mock',
    source,
    generatedAt,
    chainHeadBlock: MOCK_CHAIN_HEAD,
    indexedBlock: MOCK_INDEXED_BLOCK,
    indexLag: MOCK_CHAIN_HEAD - MOCK_INDEXED_BLOCK,
    stale: false,
    warnings: [
      'Deterministic mock data only. No value is read from or executable onchain.',
    ],
  }
}

function rawAmount(token: Token, value: string) {
  return tokenAmount(token, parseUnits(value, token.decimals), 8)
}

function price(value: string): DisplayPrice {
  return displayedPrice(BASE_TOKEN.address, QUOTE_TOKEN.address, value)
}

function positionId(byte: string): Bytes32 {
  return `0x${byte.repeat(64)}` as Bytes32
}

function transactionHash(byte: string): Hex {
  return `0x${byte.repeat(64)}` as Hex
}

function curve(options: {
  side: CurveSide
  startPrice: string
  endPrice: string
  currentPrice: string
  alpha: string
  initialReserve: string
  availableReserve: string
  yInt: string
  progressBps: number
  backingStatus?: CurveView['runtime']['backingStatus']
}): CurveView {
  const reserveToken = options.side === 'sell' ? BASE_TOKEN : QUOTE_TOKEN
  return {
    policy: {
      side: options.side,
      branch: inferBranch(
        options.side,
        options.startPrice,
        options.endPrice,
        options.alpha,
      ),
      startPrice: price(options.startPrice),
      endPrice: price(options.endPrice),
      alpha: options.startPrice === options.endPrice ? '0' : options.alpha,
      alphaWad: parseSignedWad(
        options.startPrice === options.endPrice ? '0' : options.alpha,
      ),
      initialReserve: rawAmount(reserveToken, options.initialReserve),
    },
    runtime: {
      yWad: parseWad(options.availableReserve),
      yIntWad: parseWad(options.yInt),
      progressBps: options.progressBps,
      availableOutput: rawAmount(reserveToken, options.availableReserve),
      currentMarginalPrice: price(options.currentPrice),
      backingStatus: options.backingStatus ?? 'backed',
    },
    marginalSamples: marginalSamples({
      baseToken: BASE_TOKEN.address,
      quoteToken: QUOTE_TOKEN.address,
      startPrice: options.startPrice,
      endPrice: options.endPrice,
      alpha: options.startPrice === options.endPrice ? '0' : options.alpha,
      initialReserve: options.yInt,
      points: 21,
    }),
  }
}

function backing(
  token: Token,
  logicalOutgoing: string,
  sufficientlyBacked = true,
): AssetBackingView {
  const allocation = rawAmount(token, logicalOutgoing)
  return {
    token,
    aquaAllocation: allocation,
    walletBalance: rawAmount(token, sufficientlyBacked ? '100000' : '0'),
    aquaAllowance: rawAmount(token, sufficientlyBacked ? '100000' : '0'),
    logicalOutgoing: allocation,
    sufficientlyBacked,
  }
}

export const POSITIONS: PositionDetail[] = [
  {
    id: positionId('a'),
    positionKey: positionId('1'),
    strategyHash: positionId('2'),
    policyHash: positionId('3'),
    marketId: MARKET_ID,
    maker: MAKER_A,
    lifecycle: 'active',
    runtimeVersion: 7,
    sell: curve({
      side: 'sell',
      startPrice: '1985',
      endPrice: '2300',
      currentPrice: '2004',
      alpha: '2',
      initialReserve: '8',
      availableReserve: '6.4',
      yInt: '7.1',
      progressBps: 986,
    }),
    buy: curve({
      side: 'buy',
      startPrice: '1968',
      endPrice: '1550',
      currentPrice: '1927',
      alpha: '0',
      initialReserve: '12000',
      availableReserve: '9800',
      yInt: '10800',
      progressBps: 926,
    }),
    sufficientlyBacked: true,
    lastUpdateBlock: MOCK_INDEXED_BLOCK,
    encodingVersion: 1,
    salt: positionId('4'),
    strategy: '0x4c4f4231' as Hex,
    baseBacking: backing(BASE_TOKEN, '6.4'),
    quoteBacking: backing(QUOTE_TOKEN, '9800'),
    createdAtBlock: MOCK_INDEXED_BLOCK - 420,
    createdTransaction: transactionHash('a'),
    warnings: [],
    meta: mockMeta(),
  },
  {
    id: positionId('b'),
    positionKey: positionId('5'),
    strategyHash: positionId('6'),
    policyHash: positionId('7'),
    marketId: MARKET_ID,
    maker: MAKER_B,
    lifecycle: 'active',
    runtimeVersion: 3,
    sell: curve({
      side: 'sell',
      startPrice: '2010',
      endPrice: '2010',
      currentPrice: '2010',
      alpha: '0',
      initialReserve: '4',
      availableReserve: '3.2',
      yInt: '4',
      progressBps: 2000,
    }),
    buy: curve({
      side: 'buy',
      startPrice: '1945',
      endPrice: '1945',
      currentPrice: '1945',
      alpha: '0',
      initialReserve: '6000',
      availableReserve: '5100',
      yInt: '6000',
      progressBps: 1500,
    }),
    sufficientlyBacked: true,
    lastUpdateBlock: MOCK_INDEXED_BLOCK - 1,
    encodingVersion: 1,
    salt: positionId('8'),
    strategy: '0x4c4f4231' as Hex,
    baseBacking: backing(BASE_TOKEN, '3.2'),
    quoteBacking: backing(QUOTE_TOKEN, '5100'),
    createdAtBlock: MOCK_INDEXED_BLOCK - 300,
    createdTransaction: transactionHash('b'),
    warnings: [],
    meta: mockMeta(),
  },
  {
    id: positionId('c'),
    positionKey: positionId('9'),
    strategyHash: positionId('d'),
    policyHash: positionId('e'),
    marketId: MARKET_ID,
    maker: MAKER_C,
    lifecycle: 'active',
    runtimeVersion: 11,
    sell: curve({
      side: 'sell',
      startPrice: '2025',
      endPrice: '2600',
      currentPrice: '2036',
      alpha: '-2',
      initialReserve: '12',
      availableReserve: '10.5',
      yInt: '11',
      progressBps: 455,
    }),
    buy: curve({
      side: 'buy',
      startPrice: '1938',
      endPrice: '1300',
      currentPrice: '1908',
      alpha: '-1',
      initialReserve: '18000',
      availableReserve: '16000',
      yInt: '16750',
      progressBps: 448,
    }),
    sufficientlyBacked: true,
    lastUpdateBlock: MOCK_INDEXED_BLOCK - 2,
    encodingVersion: 1,
    salt: positionId('f'),
    strategy: '0x4c4f4231' as Hex,
    baseBacking: backing(BASE_TOKEN, '10.5'),
    quoteBacking: backing(QUOTE_TOKEN, '16000'),
    createdAtBlock: MOCK_INDEXED_BLOCK - 250,
    createdTransaction: transactionHash('c'),
    warnings: [],
    meta: mockMeta(),
  },
]

export const MARKET: MarketDetail = {
  id: MARKET_ID,
  baseToken: BASE_TOKEN,
  quoteToken: QUOTE_TOKEN,
  bestBid: price('1945'),
  bestAsk: price('2004'),
  spreadBps: 303,
  stats: {
    activePositions: POSITIONS.length,
    activeSellSides: POSITIONS.length,
    activeBuySides: POSITIONS.length,
    fillCount24h: 18,
    volumeQuote24h: rawAmount(QUOTE_TOKEN, '48750'),
  },
  lastUpdateBlock: MOCK_INDEXED_BLOCK,
  recentRouteIds: [ROUTE_ID],
  meta: mockMeta(),
}

export const ACTIVITY: ActivityItem[] = [
  {
    id: 'activity-route-1',
    type: 'route-executed',
    marketId: MARKET_ID,
    positionId: null,
    routeId: ROUTE_ID,
    maker: null,
    side: 'sell',
    amountIn: rawAmount(QUOTE_TOKEN, '1000'),
    amountOut: rawAmount(BASE_TOKEN, '0.497'),
    blockNumber: MOCK_INDEXED_BLOCK,
    transactionHash: transactionHash('7'),
    timestamp: '2026-07-25T14:58:00.000Z',
  },
  {
    id: 'activity-fill-1',
    type: 'curve-filled',
    marketId: MARKET_ID,
    positionId: POSITIONS[0]!.id,
    routeId: ROUTE_ID,
    maker: MAKER_A,
    side: 'sell',
    amountIn: rawAmount(QUOTE_TOKEN, '600'),
    amountOut: rawAmount(BASE_TOKEN, '0.299'),
    blockNumber: MOCK_INDEXED_BLOCK,
    transactionHash: transactionHash('7'),
    timestamp: '2026-07-25T14:58:00.000Z',
  },
]

export const BOOTSTRAP: FrontendBootstrap = {
  protocolName: 'Liquid OB',
  protocolVersion: 'frontend-contract-v1',
  mode: 'mock',
  network: {
    chainId: MOCK_CHAIN_ID,
    name: 'Liquid OB deterministic mock',
    explorerUrl: null,
    nativeCurrencySymbol: 'ETH',
  },
  deploymentBlock: null,
  addresses: MOCK_ADDRESSES,
  services: [
    {
      name: 'rpc',
      health: 'not-configured',
      url: null,
      message: 'Mock adapter does not call RPC.',
    },
    {
      name: 'subgraph',
      health: 'not-configured',
      url: null,
      message: 'Deterministic fixtures stand in for indexed data.',
    },
    {
      name: 'solver',
      health: 'healthy',
      url: null,
      message: 'Local mock routing is available for frontend development.',
    },
  ],
  features: {
    marketExplorer: true,
    makerPreview: true,
    publishPosition: true,
    positionManagement: true,
    exactInputQuotes: true,
    exactOutputQuotes: true,
    executeRoutes: true,
    liveWrites: false,
  },
  tokens: [BASE_TOKEN, QUOTE_TOKEN],
  meta: mockMeta(),
}

export function fixturePriceWad(position: PositionDetail, side: CurveSide): bigint {
  return BigInt(position[side].runtime.currentMarginalPrice.wad)
}

export function fixtureNativeRate(
  position: PositionDetail,
  side: CurveSide,
): WadInteger {
  const priceWad = fixturePriceWad(position, side)
  if (side === 'buy') return priceWad.toString() as WadInteger
  return ((10n ** 36n) / priceWad).toString() as WadInteger
}

export function fixturePriceLabel(wad: WadInteger): string {
  return formatWad(wad, 8)
}
