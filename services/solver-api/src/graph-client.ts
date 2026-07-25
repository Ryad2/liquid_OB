import {
  compileCurve,
  type CompiledCurve,
  type CurveBranch,
  type CurveSide,
} from '@liquid-ob/curve-math'
import type { SolverCandidate } from '@liquid-ob/solver-core'
import { isAddress, isHex, type Address, type Hex } from 'viem'
import { z } from 'zod'

import { ApiError } from './errors.js'
import type { GraphGateway, GraphHealth, IndexedMarketSnapshot, IndexedToken } from './types.js'

const ACTIVE_SIDES_QUERY = `
  query ActiveSides($market: ID!, $side: CurveSideKind!, $first: Int!, $skip: Int!) {
    _meta { block { number hash } hasIndexingErrors }
    curveSides(
      where: { market: $market, side: $side, active: true, yWad_gt: "0" }
      first: $first
      skip: $skip
      orderBy: currentPriceWad
      orderDirection: desc
    ) {
      id side branch startPriceWad endPriceWad alphaWad alphaNativeWad betaNativeWad
      pLowWad pHighWad muWad kappaWad initialReserveWad yWad yIntWad active lastUpdateBlock
      position {
        id positionKey strategyHash strategy runtimeVersion active sufficientlyAllocated
        maker { address }
        market {
          marketId
          baseToken { address symbol name decimals }
          quoteToken { address symbol name decimals }
        }
      }
    }
  }
`

const HEALTH_QUERY = `query Health { _meta { block { number hash } hasIndexingErrors } }`

const tokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(18),
})

const sideSchema = z.object({
  id: z.string(),
  side: z.enum(['SELL', 'BUY']),
  branch: z.enum(['GENERAL', 'NATIVE_ALPHA_ZERO', 'NATIVE_ALPHA_ONE', 'FLAT']),
  startPriceWad: z.string(),
  endPriceWad: z.string(),
  alphaWad: z.string(),
  alphaNativeWad: z.string(),
  betaNativeWad: z.string(),
  pLowWad: z.string(),
  pHighWad: z.string(),
  muWad: z.string(),
  kappaWad: z.string(),
  initialReserveWad: z.string(),
  yWad: z.string(),
  yIntWad: z.string(),
  active: z.boolean(),
  lastUpdateBlock: z.string(),
  position: z.object({
    id: z.string(),
    positionKey: z.string(),
    strategyHash: z.string(),
    strategy: z.string(),
    runtimeVersion: z.string(),
    active: z.boolean(),
    sufficientlyAllocated: z.boolean(),
    maker: z.object({ address: z.string() }),
    market: z.object({
      marketId: z.string(),
      baseToken: tokenSchema,
      quoteToken: tokenSchema,
    }),
  }),
})

const responseSchema = z.object({
  data: z.object({
    _meta: z.object({
      block: z.object({ number: z.number().int().nonnegative(), hash: z.string().nullable() }),
      hasIndexingErrors: z.boolean(),
    }),
    curveSides: z.array(sideSchema),
  }).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

const healthSchema = z.object({
  data: z.object({
    _meta: z.object({
      block: z.object({ number: z.number().int().nonnegative(), hash: z.string().nullable() }),
      hasIndexingErrors: z.boolean(),
    }),
  }).optional(),
  errors: z.array(z.object({ message: z.string() })).optional(),
})

export interface GraphClientOptions {
  endpoint: string
  pageSize?: number
  maxPages?: number
  timeoutMs?: number
  fetch?: typeof globalThis.fetch
}

export class LiquidOBGraphClient implements GraphGateway {
  readonly #endpoint: string
  readonly #pageSize: number
  readonly #maxPages: number
  readonly #timeoutMs: number
  readonly #fetch: typeof globalThis.fetch

  constructor(options: GraphClientOptions) {
    this.#endpoint = options.endpoint
    this.#pageSize = options.pageSize ?? 200
    this.#maxPages = options.maxPages ?? 100
    this.#timeoutMs = options.timeoutMs ?? 8_000
    this.#fetch = options.fetch ?? globalThis.fetch
  }

  async health(signal?: AbortSignal): Promise<GraphHealth> {
    const payload = healthSchema.parse(await this.#request(HEALTH_QUERY, {}, signal))
    const data = requireData(payload)
    return {
      indexedBlock: BigInt(data._meta.block.number),
      indexedBlockHash: nullableHex(data._meta.block.hash),
      indexingErrors: data._meta.hasIndexingErrors,
    }
  }

  async candidates(
    marketId: Hex,
    side: CurveSide,
    signal?: AbortSignal,
  ): Promise<IndexedMarketSnapshot> {
    const rows: z.infer<typeof sideSchema>[] = []
    let meta: GraphHealth | null = null
    for (let page = 0; page < this.#maxPages; page += 1) {
      const payload = responseSchema.parse(await this.#request(ACTIVE_SIDES_QUERY, {
        market: marketId.toLowerCase(),
        side: side === 'sell' ? 'SELL' : 'BUY',
        first: this.#pageSize,
        skip: page * this.#pageSize,
      }, signal))
      const data = requireData(payload)
      const pageMeta: GraphHealth = {
        indexedBlock: BigInt(data._meta.block.number),
        indexedBlockHash: nullableHex(data._meta.block.hash),
        indexingErrors: data._meta.hasIndexingErrors,
      }
      if (meta !== null && pageMeta.indexedBlock !== meta.indexedBlock) {
        throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Subgraph advanced during pagination; retry the snapshot')
      }
      meta = pageMeta
      rows.push(...data.curveSides)
      if (data.curveSides.length < this.#pageSize) break
      if (page === this.#maxPages - 1) {
        throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Candidate pagination exceeded configured maximum')
      }
    }
    if (meta === null) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Subgraph returned no metadata')

    const normalized = rows.map((row) => normalizeSide(row, meta!.indexedBlock, side, marketId))
    const market = rows[0]?.position.market
    if (market === undefined) {
      throw new ApiError('INSUFFICIENT_LIQUIDITY', 422, 'No active indexed side exists for this market')
    }
    return {
      marketId,
      baseToken: normalizeToken(market.baseToken),
      quoteToken: normalizeToken(market.quoteToken),
      indexedBlock: meta.indexedBlock,
      indexedBlockHash: meta.indexedBlockHash,
      indexingErrors: meta.indexingErrors,
      candidates: normalized,
    }
  }

  async #request(query: string, variables: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    try {
      const response = await this.#fetch(this.#endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query, variables }),
        signal: signal === undefined
          ? AbortSignal.timeout(this.#timeoutMs)
          : AbortSignal.any([signal, AbortSignal.timeout(this.#timeoutMs)]),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.json()
    } catch (error) {
      if (error instanceof ApiError) throw error
      throw new ApiError(
        'SUBGRAPH_UNAVAILABLE',
        503,
        `Subgraph request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }
}

function normalizeSide(
  row: z.infer<typeof sideSchema>,
  indexedBlock: bigint,
  requestedSide: CurveSide,
  requestedMarket: Hex,
): SolverCandidate {
  const side = row.side === 'SELL' ? 'sell' : 'buy'
  if (side !== requestedSide) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Subgraph returned the wrong side')
  const marketId = asHex(row.position.market.marketId, 'market id')
  if (marketId.toLowerCase() !== requestedMarket.toLowerCase()) {
    throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Subgraph returned the wrong market')
  }
  const draft = {
    startPriceWad: BigInt(row.startPriceWad),
    endPriceWad: BigInt(row.endPriceWad),
    alphaWad: BigInt(row.alphaWad),
    initialReserveWad: BigInt(row.initialReserveWad),
  }
  const compiled = compileCurve(draft, side)
  const curve: CompiledCurve = {
    ...compiled,
    branch: normalizeBranch(row.branch),
    alphaNativeWad: BigInt(row.alphaNativeWad),
    betaNativeWad: BigInt(row.betaNativeWad),
    pLowWad: BigInt(row.pLowWad),
    pHighWad: BigInt(row.pHighWad),
    muWad: BigInt(row.muWad),
    kappaWad: BigInt(row.kappaWad),
  }
  if (curve.branch !== compiled.branch) {
    throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, `Indexed branch mismatch for ${row.position.id}`)
  }

  return {
    id: asHex(row.position.id, 'position id'),
    positionKey: asHex(row.position.positionKey, 'position key'),
    marketId,
    maker: asAddress(row.position.maker.address, 'maker'),
    strategyHash: asHex(row.position.strategyHash, 'strategy hash'),
    strategy: asHex(row.position.strategy, 'strategy'),
    side,
    curve,
    state: { yWad: BigInt(row.yWad), yIntWad: BigInt(row.yIntWad) },
    expectedVersion: BigInt(row.position.runtimeVersion),
    indexedBlock,
    active: row.active && row.position.active,
    sufficientlyBacked: row.position.sufficientlyAllocated,
  }
}

function normalizeToken(value: z.infer<typeof tokenSchema>): IndexedToken {
  return {
    address: asAddress(value.address, 'token'),
    symbol: value.symbol,
    name: value.name,
    decimals: value.decimals,
  }
}

function normalizeBranch(branch: z.infer<typeof sideSchema>['branch']): CurveBranch {
  if (branch === 'NATIVE_ALPHA_ZERO') return 'native-alpha-zero'
  if (branch === 'NATIVE_ALPHA_ONE') return 'native-alpha-one'
  return branch === 'FLAT' ? 'flat' : 'general'
}

function requireData<T>(payload: {
  data?: T | undefined
  errors?: Array<{ message: string }> | undefined
}): T {
  if (payload.errors?.length) {
    throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, payload.errors.map((error) => error.message).join('; '))
  }
  if (payload.data === undefined) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Subgraph response has no data')
  return payload.data
}

function nullableHex(value: string | null): Hex | null {
  return value === null ? null : asHex(value, 'block hash')
}

function asHex(value: string, label: string): Hex {
  if (!isHex(value)) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, `Invalid indexed ${label}`)
  return value
}

function asAddress(value: string, label: string): Address {
  if (!isAddress(value)) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, `Invalid indexed ${label}`)
  return value
}
