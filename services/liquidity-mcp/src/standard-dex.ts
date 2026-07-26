import { z } from 'zod'

import type { Market } from './schemas.js'

const graphResponseSchema = z.object({
  data: z.object({
    _meta: z.object({
      block: z.object({ number: z.number().int().nonnegative() }),
      hasIndexingErrors: z.boolean(),
    }),
    liquidityPools: z.array(z.object({
      id: z.string(),
      name: z.string().nullable().optional(),
      inputTokens: z.array(z.object({
        id: z.string(),
        symbol: z.string(),
        decimals: z.number().int().nonnegative(),
      })),
      inputTokenBalances: z.array(z.string().regex(/^\d+$/)),
      inputTokenBalancesUSD: z.array(z.string()).optional(),
      totalValueLockedUSD: z.string(),
      cumulativeVolumeUSD: z.string(),
    })),
  }).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

const POOLS_QUERY = `
query ComparablePools($tokens: [String!]!, $first: Int!) {
  _meta { block { number } hasIndexingErrors }
  liquidityPools(
    first: $first
    where: { inputTokens_contains: $tokens }
    orderBy: totalValueLockedUSD
    orderDirection: desc
  ) {
    id
    name
    inputTokens { id symbol decimals }
    inputTokenBalances
    inputTokenBalancesUSD
    totalValueLockedUSD
    cumulativeVolumeUSD
  }
}`

export interface DexComparisonRequest {
  side: 'sell' | 'buy'
  kind: 'exact-input' | 'exact-output'
  amountRaw: string
}

export interface StandardDexSnapshot {
  configured: boolean
  venue: string
  model: 'snapshot-only' | 'constant-product-v2'
  indexedBlock: number | null
  hasIndexingErrors: boolean | null
  tokenIn: string
  tokenOut: string
  pools: Array<{
    id: string
    name: string | null
    reserveInRaw: string
    reserveOutRaw: string
    totalValueLockedUSD: string
    cumulativeVolumeUSD: string
    estimate: { amountInRaw: string; amountOutRaw: string } | null
  }>
  bestEstimate: { poolId: string; amountInRaw: string; amountOutRaw: string } | null
  executionStatus: 'not-configured' | 'indexed-snapshot-only' | 'indexed-estimate-only'
  caveats: string[]
}

export interface StandardDexGateway {
  compare(market: Market, request: DexComparisonRequest, signal?: AbortSignal): Promise<StandardDexSnapshot>
}

interface StandardDexOptions {
  endpoint?: string
  venue: string
  model: 'snapshot-only' | 'constant-product-v2'
  feeBps: number
  timeoutMs?: number
  fetch?: typeof globalThis.fetch
}

export class StandardDexGraphClient implements StandardDexGateway {
  readonly #endpoint: string | undefined
  readonly #venue: string
  readonly #model: 'snapshot-only' | 'constant-product-v2'
  readonly #feeBps: number
  readonly #timeoutMs: number
  readonly #fetch: typeof globalThis.fetch

  constructor(options: StandardDexOptions) {
    this.#endpoint = options.endpoint
    this.#venue = options.venue
    this.#model = options.model
    this.#feeBps = options.feeBps
    this.#timeoutMs = options.timeoutMs ?? 8_000
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async compare(market: Market, request: DexComparisonRequest, signal?: AbortSignal): Promise<StandardDexSnapshot> {
    const tokenIn = request.side === 'sell' ? market.quoteToken.address : market.baseToken.address
    const tokenOut = request.side === 'sell' ? market.baseToken.address : market.quoteToken.address
    if (this.#endpoint === undefined) return notConfigured(this.#venue, this.#model, tokenIn, tokenOut)

    const timeout = AbortSignal.timeout(this.#timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const response = await this.#fetch(this.#endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: POOLS_QUERY,
        variables: { tokens: [market.baseToken.address.toLowerCase(), market.quoteToken.address.toLowerCase()], first: 20 },
      }),
      signal: combined,
    })
    if (!response.ok) throw new Error(`Standardized DEX Subgraph request failed with HTTP ${response.status}`)
    const parsed = graphResponseSchema.parse(await response.json())
    if (parsed.errors?.length) throw new Error(`Standardized DEX Subgraph error: ${parsed.errors.map((error) => error.message).join('; ')}`)
    if (parsed.data === undefined) throw new Error('Standardized DEX Subgraph returned no data')

    const pools = parsed.data.liquidityPools.flatMap((pool) => {
      const inIndex = pool.inputTokens.findIndex((token) => sameAddress(token.id, tokenIn))
      const outIndex = pool.inputTokens.findIndex((token) => sameAddress(token.id, tokenOut))
      if (inIndex < 0 || outIndex < 0 || pool.inputTokenBalances[inIndex] === undefined || pool.inputTokenBalances[outIndex] === undefined) return []
      const reserveInRaw = pool.inputTokenBalances[inIndex]
      const reserveOutRaw = pool.inputTokenBalances[outIndex]
      const estimate = this.#model === 'constant-product-v2' && pool.inputTokens.length === 2
        ? quoteConstantProduct(reserveInRaw, reserveOutRaw, request.kind, request.amountRaw, this.#feeBps)
        : null
      return [{
        id: pool.id,
        name: pool.name ?? null,
        reserveInRaw,
        reserveOutRaw,
        totalValueLockedUSD: pool.totalValueLockedUSD,
        cumulativeVolumeUSD: pool.cumulativeVolumeUSD,
        estimate,
      }]
    })
    const quotable = pools.filter((pool): pool is typeof pool & { estimate: NonNullable<typeof pool.estimate> } => pool.estimate !== null)
    quotable.sort((left, right) => compareEstimate(left.estimate, right.estimate, request.kind))
    const best = quotable[0]
    return {
      configured: true,
      venue: this.#venue,
      model: this.#model,
      indexedBlock: parsed.data._meta.block.number,
      hasIndexingErrors: parsed.data._meta.hasIndexingErrors,
      tokenIn,
      tokenOut,
      pools,
      bestEstimate: best === undefined ? null : { poolId: best.id, ...best.estimate },
      executionStatus: this.#model === 'snapshot-only' ? 'indexed-snapshot-only' : 'indexed-estimate-only',
      caveats: this.#model === 'snapshot-only'
        ? ['The standardized source exposes comparable indexed liquidity, not an executable quote.']
        : [
            'The estimate assumes a two-token constant-product-v2 pool and the configured fee.',
            'It is based on an indexed block and is not calldata, an eth_call simulation, or an execution guarantee.',
          ],
    }
  }
}

export function quoteConstantProduct(
  reserveInRaw: string,
  reserveOutRaw: string,
  kind: 'exact-input' | 'exact-output',
  amountRaw: string,
  feeBps: number,
): { amountInRaw: string; amountOutRaw: string } | null {
  const reserveIn = BigInt(reserveInRaw)
  const reserveOut = BigInt(reserveOutRaw)
  const amount = BigInt(amountRaw)
  const denominator = 10_000n
  const feeMultiplier = denominator - BigInt(feeBps)
  if (reserveIn <= 0n || reserveOut <= 0n || amount <= 0n || feeMultiplier <= 0n) return null
  if (kind === 'exact-input') {
    const amountInAfterFee = amount * feeMultiplier
    const amountOut = reserveOut * amountInAfterFee / (reserveIn * denominator + amountInAfterFee)
    return amountOut === 0n ? null : { amountInRaw: amount.toString(), amountOutRaw: amountOut.toString() }
  }
  if (amount >= reserveOut) return null
  const netInput = divCeil(reserveIn * amount, reserveOut - amount)
  const grossInput = divCeil(netInput * denominator, feeMultiplier)
  return { amountInRaw: grossInput.toString(), amountOutRaw: amount.toString() }
}

function divCeil(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator - 1n) / denominator
}

function compareEstimate(
  left: { amountInRaw: string; amountOutRaw: string },
  right: { amountInRaw: string; amountOutRaw: string },
  kind: 'exact-input' | 'exact-output',
): number {
  const a = BigInt(kind === 'exact-input' ? left.amountOutRaw : left.amountInRaw)
  const b = BigInt(kind === 'exact-input' ? right.amountOutRaw : right.amountInRaw)
  if (a === b) return 0
  return kind === 'exact-input' ? (a > b ? -1 : 1) : (a < b ? -1 : 1)
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function notConfigured(
  venue: string,
  model: 'snapshot-only' | 'constant-product-v2',
  tokenIn: string,
  tokenOut: string,
): StandardDexSnapshot {
  return {
    configured: false,
    venue,
    model,
    indexedBlock: null,
    hasIndexingErrors: null,
    tokenIn,
    tokenOut,
    pools: [],
    bestEstimate: null,
    executionStatus: 'not-configured',
    caveats: ['Set STANDARD_DEX_SUBGRAPH_URL to enable the second Graph-backed source.'],
  }
}
