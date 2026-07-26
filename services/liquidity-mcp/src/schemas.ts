import { z } from 'zod'

export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
export const bytes32Schema = z.string().regex(/^0x[0-9a-fA-F]{64}$/)
export const rawAmountSchema = z.string().min(1).max(78).regex(/^\d+$/).refine(
  (value) => BigInt(value) <= (1n << 256n) - 1n,
  'Amount exceeds uint256',
)
export const positiveRawAmountSchema = rawAmountSchema.refine(
  (value) => BigInt(value) > 0n,
  'Amount must be positive',
)

const tokenSchema = z.object({
  address: addressSchema,
  chainId: z.number().int().positive(),
  symbol: z.string().min(1),
  name: z.string().min(1),
  decimals: z.number().int().min(0).max(255),
})

const amountSchema = z.object({ token: tokenSchema, raw: rawAmountSchema, formatted: z.string() })
const priceSchema = z.object({
  baseToken: addressSchema,
  quoteToken: addressSchema,
  wad: rawAmountSchema,
  formatted: z.string(),
})
const metaSchema = z.object({
  mode: z.enum(['mock', 'live']),
  source: z.string(),
  generatedAt: z.string(),
  chainHeadBlock: z.number().int().nonnegative().nullable(),
  indexedBlock: z.number().int().nonnegative().nullable(),
  indexLag: z.number().int().nonnegative().nullable(),
  stale: z.boolean(),
  warnings: z.array(z.string()),
})
const curveSchema = z.object({
  policy: z.object({
    side: z.enum(['sell', 'buy']),
    branch: z.string(),
    startPrice: priceSchema,
    endPrice: priceSchema,
    alpha: z.string(),
    alphaWad: z.string(),
    initialReserve: amountSchema,
  }),
  runtime: z.object({
    yWad: rawAmountSchema,
    yIntWad: rawAmountSchema,
    progressBps: z.number().int().min(0).max(10_000),
    availableOutput: amountSchema,
    currentMarginalPrice: priceSchema,
    backingStatus: z.string(),
  }),
})

export const marketSchema = z.object({
  id: bytes32Schema,
  baseToken: tokenSchema,
  quoteToken: tokenSchema,
  bestBid: priceSchema.nullable(),
  bestAsk: priceSchema.nullable(),
  spreadBps: z.number().nullable(),
  stats: z.object({
    activePositions: z.number().int().nonnegative(),
    activeSellSides: z.number().int().nonnegative(),
    activeBuySides: z.number().int().nonnegative(),
    fillCount24h: z.number().int().nonnegative(),
    volumeQuote24h: amountSchema,
  }),
  lastUpdateBlock: z.number().int().nonnegative(),
  recentRouteIds: z.array(bytes32Schema),
  meta: metaSchema,
})

export const positionSchema = z.object({
  id: bytes32Schema,
  positionKey: bytes32Schema,
  strategyHash: bytes32Schema,
  marketId: bytes32Schema,
  maker: addressSchema,
  lifecycle: z.string(),
  runtimeVersion: z.number().int().nonnegative(),
  sell: curveSchema,
  buy: curveSchema,
  sufficientlyBacked: z.boolean(),
  lastUpdateBlock: z.number().int().nonnegative(),
})

export const positionPageSchema = z.object({
  items: z.array(positionSchema),
  pageInfo: z.object({
    cursor: z.string().nullable(),
    hasNextPage: z.boolean(),
    totalCount: z.number().int().nonnegative(),
  }),
  meta: metaSchema,
})

export const routeSchema = z.object({
  routeId: bytes32Schema,
  marketId: bytes32Schema,
  side: z.enum(['sell', 'buy']),
  kind: z.enum(['exact-input', 'exact-output']),
  indexedBlock: rawAmountSchema,
  chainHeadBlock: rawAmountSchema,
  indexLag: rawAmountSchema,
  amountInRaw: rawAmountSchema,
  amountOutRaw: rawAmountSchema,
  limitRaw: rawAmountSchema,
  deadline: z.number().int().positive(),
  fills: z.array(z.object({
    index: z.number().int().nonnegative(),
    positionId: bytes32Schema,
    maker: addressSchema,
    expectedVersion: rawAmountSchema,
    amountInRaw: rawAmountSchema,
    amountOutRaw: rawAmountSchema,
    displayedEffectivePriceWad: rawAmountSchema,
  }).passthrough()),
  transaction: z.object({ to: addressSchema, data: z.string(), value: rawAmountSchema }),
  simulation: z.object({
    status: z.enum(['success', 'not-run']),
    gasEstimate: rawAmountSchema.nullable(),
    blockNumber: rawAmountSchema.nullable(),
  }),
})

export type Market = z.infer<typeof marketSchema>
export type Position = z.infer<typeof positionSchema>
export type PreparedRoute = z.infer<typeof routeSchema>
