import { z } from 'zod'

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
const hex = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/)
const raw = z.string().regex(/^\d+$/)
const signed = z.string().regex(/^-?\d+$/)
const nullableBlock = z.number().int().nonnegative().nullable()

const token = z.object({
  address,
  chainId: z.number().int().positive(),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().min(0).max(18),
  logoUri: z.string().optional(),
})
const tokenAmount = z.object({ token, raw, formatted: z.string() })
const displayPrice = z.object({ baseToken: address, quoteToken: address, wad: raw, formatted: z.string() })
const dataMeta = z.object({
  mode: z.enum(['mock', 'live']),
  source: z.enum(['mock', 'deployment-manifest', 'curve-math', 'subgraph', 'solver', 'rpc', 'composed']),
  generatedAt: z.string().datetime(),
  chainHeadBlock: nullableBlock,
  indexedBlock: nullableBlock,
  indexLag: nullableBlock,
  stale: z.boolean(),
  warnings: z.array(z.string()),
})
const pageInfo = z.object({ cursor: z.string().nullable(), hasNextPage: z.boolean(), totalCount: z.number().int().nonnegative() })

const curveSample = z.object({
  progressBps: z.number().int().min(0).max(10_000),
  displayedMarginalPrice: displayPrice,
  remainingReserve: z.string(),
})
const curvePolicy = z.object({
  side: z.enum(['sell', 'buy']),
  branch: z.enum(['general', 'native-alpha-zero', 'native-alpha-one', 'flat']),
  startPrice: displayPrice,
  endPrice: displayPrice,
  alpha: z.string(),
  alphaWad: signed,
  initialReserve: tokenAmount,
})
const curveRuntime = z.object({
  yWad: raw,
  yIntWad: raw,
  progressBps: z.number().int().min(0).max(10_000),
  availableOutput: tokenAmount,
  currentMarginalPrice: displayPrice,
  backingStatus: z.enum(['backed', 'warning', 'unavailable']),
})
const curve = z.object({ policy: curvePolicy, runtime: curveRuntime, marginalSamples: z.array(curveSample) })

export const bootstrapSchema = z.object({
  protocolName: z.literal('ArcBook'),
  protocolVersion: z.string(),
  mode: z.enum(['mock', 'live']),
  network: z.object({
    chainId: z.number().int().positive(),
    name: z.string(),
    explorerUrl: z.string().nullable(),
    nativeCurrencySymbol: z.string(),
  }),
  deploymentBlock: nullableBlock,
  addresses: z.object({
    aqua: address.nullable(),
    swapVmRouter: address.nullable(),
    curveKernel: address.nullable(),
    liquidOBRouter: address.nullable(),
    quoter: address.nullable(),
    lens: address.nullable(),
    batchExecutor: address.nullable(),
  }),
  services: z.array(z.object({
    name: z.enum(['rpc', 'subgraph', 'solver']),
    health: z.enum(['healthy', 'degraded', 'offline', 'not-configured']),
    url: z.string().nullable(),
    message: z.string(),
  })),
  features: z.object({
    marketExplorer: z.boolean(),
    makerPreview: z.boolean(),
    publishPosition: z.boolean(),
    positionManagement: z.boolean(),
    exactInputQuotes: z.boolean(),
    exactOutputQuotes: z.boolean(),
    executeRoutes: z.boolean(),
    liveWrites: z.boolean(),
  }),
  tokens: z.array(token),
  meta: dataMeta,
})

export const marketSchema = z.object({
  id: bytes32,
  baseToken: token,
  quoteToken: token,
  bestBid: displayPrice.nullable(),
  bestAsk: displayPrice.nullable(),
  spreadBps: z.number().nullable(),
  stats: z.object({
    activePositions: z.number().int().nonnegative(),
    activeSellSides: z.number().int().nonnegative(),
    activeBuySides: z.number().int().nonnegative(),
    fillCount24h: z.number().int().nonnegative(),
    volumeQuote24h: tokenAmount,
  }),
  lastUpdateBlock: z.number().int().nonnegative(),
})
export const marketDetailSchema = marketSchema.extend({ recentRouteIds: z.array(bytes32), meta: dataMeta })

export const positionSchema = z.object({
  id: bytes32,
  positionKey: bytes32,
  strategyHash: bytes32,
  policyHash: bytes32,
  marketId: bytes32,
  maker: address,
  lifecycle: z.enum(['unknown', 'active', 'docked']),
  runtimeVersion: z.number().int().nonnegative(),
  sell: curve,
  buy: curve,
  sufficientlyBacked: z.boolean(),
  lastUpdateBlock: z.number().int().nonnegative(),
})
const backing = z.object({
  token,
  aquaAllocation: tokenAmount,
  walletBalance: tokenAmount,
  aquaAllowance: tokenAmount,
  logicalOutgoing: tokenAmount,
  sufficientlyBacked: z.boolean(),
})
export const positionDetailSchema = positionSchema.extend({
  encodingVersion: z.number().int().positive(),
  salt: bytes32,
  strategy: hex.nullable(),
  baseBacking: backing,
  quoteBacking: backing,
  createdAtBlock: z.number().int().nonnegative(),
  createdTransaction: hex,
  warnings: z.array(z.string()),
  meta: dataMeta,
})

export const activitySchema = z.object({
  id: z.string(),
  type: z.enum(['position-published', 'curve-filled', 'route-executed', 'position-docked']),
  marketId: bytes32,
  positionId: bytes32.nullable(),
  routeId: bytes32.nullable(),
  maker: address.nullable(),
  side: z.enum(['sell', 'buy']).nullable(),
  amountIn: tokenAmount.nullable(),
  amountOut: tokenAmount.nullable(),
  blockNumber: z.number().int().nonnegative(),
  transactionHash: hex,
  timestamp: z.string().datetime(),
})

export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), pageInfo, meta: dataMeta })
}

export const preparedRouteSchema = z.object({
  routeId: bytes32,
  marketId: bytes32,
  side: z.enum(['sell', 'buy']),
  kind: z.enum(['exact-input', 'exact-output']),
  indexedBlock: raw,
  chainHeadBlock: raw,
  indexLag: raw,
  amountInRaw: raw,
  amountOutRaw: raw,
  limitRaw: raw,
  deadline: z.number().int().positive(),
  fills: z.array(z.object({
    index: z.number().int().nonnegative(),
    positionId: bytes32,
    positionKey: bytes32,
    maker: address,
    strategyHash: bytes32,
    expectedVersion: raw,
    fixedAmountRaw: raw,
    amountInRaw: raw,
    amountOutRaw: raw,
    nativeRateBeforeWad: raw,
    nativeRateAfterWad: raw,
    displayedPriceBeforeWad: raw,
    displayedPriceAfterWad: raw,
    displayedEffectivePriceWad: raw,
    activeYBeforeWad: raw,
    activeYAfterWad: raw,
    activeYIntWad: raw,
  })),
  transaction: z.object({ to: address, data: hex, value: raw }),
  simulation: z.object({
    status: z.enum(['success', 'not-run']),
    gasEstimate: raw.nullable(),
    blockNumber: raw.nullable(),
  }),
})

export const errorEnvelopeSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.record(z.string(), z.unknown()).optional() }),
})

export type PreparedRoutePayload = z.infer<typeof preparedRouteSchema>
