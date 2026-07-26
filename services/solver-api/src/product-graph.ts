import { isAddress, isHex, type Address, type Hex } from 'viem'
import { z } from 'zod'

import { ApiError } from './errors.js'
import type { GraphHealth } from './types.js'

const META = `_meta { block { number hash } hasIndexingErrors }`
const TOKEN = `address symbol name decimals`
const SIDE = `
  id side branch startPriceWad endPriceWad alphaWad initialReserveWad
  yWad yIntWad currentPriceWad aquaAllocationRaw active lastUpdateBlock
  tokenIn { ${TOKEN} }
  tokenOut { ${TOKEN} }
`

const HEALTH_QUERY = `query ProductHealth { ${META} }`
const MARKETS_QUERY = `
  query Markets($block: Int!, $first: Int!, $skip: Int!) {
    ${META}
    markets(block: { number: $block }, first: $first, skip: $skip, orderBy: lastUpdateBlock, orderDirection: desc) {
      id marketId positionCount activePositionCount fillCount routeCount
      volumeBaseRaw volumeQuoteRaw lastUpdateBlock lastUpdateTimestamp
      baseToken { ${TOKEN} }
      quoteToken { ${TOKEN} }
    }
  }
`
const MARKET_SIDES_QUERY = `
  query MarketSides($block: Int!, $first: Int!, $skip: Int!) {
    ${META}
    curveSides(
      block: { number: $block }
      where: { active: true, yWad_gt: "0" }
      first: $first
      skip: $skip
      orderBy: lastUpdateBlock
      orderDirection: desc
    ) {
      market { id }
      side currentPriceWad
    }
  }
`
const SNAPSHOTS_QUERY = `
  query MarketSnapshots($block: Int!, $day: Int!, $first: Int!, $skip: Int!) {
    ${META}
    marketSnapshots(
      block: { number: $block }
      where: { day: $day }
      first: $first
      skip: $skip
    ) {
      market { id }
      fillCount routeCount volumeBaseRaw volumeQuoteRaw lastUpdateBlock
    }
  }
`
const POSITIONS_QUERY = `
  query Positions($block: Int!, $where: Position_filter!, $first: Int!, $skip: Int!) {
    ${META}
    positions(
      block: { number: $block }
      where: $where
      first: $first
      skip: $skip
      orderBy: lastUpdateBlock
      orderDirection: desc
    ) {
      id positionKey strategyHash policyHash strategy salt encodingVersion
      active docked initialized runtimeVersion sufficientlyAllocated
      baseAllocationRaw quoteAllocationRaw createdBlock createdTimestamp
      createdTransaction lastUpdateBlock lastUpdateTimestamp lastUpdateTransaction
      maker { address }
      market { id marketId }
      baseToken { ${TOKEN} }
      quoteToken { ${TOKEN} }
      sides(first: 2) { ${SIDE} }
    }
  }
`
const FILLS_QUERY = `
  query Fills($block: Int!, $where: Fill_filter!, $first: Int!) {
    ${META}
    fills(block: { number: $block }, where: $where, first: $first, orderBy: blockNumber, orderDirection: desc) {
      id routeId fillIndex side amountInRaw amountOutRaw blockNumber timestamp transactionHash
      position { id }
      market { id marketId }
      maker { address }
      tokenIn { ${TOKEN} }
      tokenOut { ${TOKEN} }
    }
  }
`
const ROUTES_QUERY = `
  query Routes($block: Int!, $where: Route_filter!, $first: Int!) {
    ${META}
    routes(block: { number: $block }, where: $where, first: $first, orderBy: blockNumber, orderDirection: desc) {
      id routeId side amountInRaw amountOutRaw blockNumber timestamp transactionHash
      market { id marketId }
      tokenIn { ${TOKEN} }
      tokenOut { ${TOKEN} }
    }
  }
`

const tokenSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number().int().min(0).max(18),
})
const metaSchema = z.object({
  block: z.object({ number: z.number().int().nonnegative(), hash: z.string().nullable() }),
  hasIndexingErrors: z.boolean(),
})
const marketSchema = z.object({
  id: z.string(), marketId: z.string(), positionCount: z.string(), activePositionCount: z.string(),
  fillCount: z.string(), routeCount: z.string(), volumeBaseRaw: z.string(), volumeQuoteRaw: z.string(),
  lastUpdateBlock: z.string(), lastUpdateTimestamp: z.string(), baseToken: tokenSchema, quoteToken: tokenSchema,
})
const marketSideSchema = z.object({
  market: z.object({ id: z.string() }), side: z.enum(['SELL', 'BUY']), currentPriceWad: z.string(),
})
const snapshotSchema = z.object({
  market: z.object({ id: z.string() }), fillCount: z.string(), routeCount: z.string(),
  volumeBaseRaw: z.string(), volumeQuoteRaw: z.string(), lastUpdateBlock: z.string(),
})
const sideSchema = z.object({
  id: z.string(), side: z.enum(['SELL', 'BUY']),
  branch: z.enum(['GENERAL', 'NATIVE_ALPHA_ZERO', 'NATIVE_ALPHA_ONE', 'FLAT']),
  startPriceWad: z.string(), endPriceWad: z.string(), alphaWad: z.string(), initialReserveWad: z.string(),
  yWad: z.string(), yIntWad: z.string(), currentPriceWad: z.string(), aquaAllocationRaw: z.string(),
  active: z.boolean(), lastUpdateBlock: z.string(), tokenIn: tokenSchema, tokenOut: tokenSchema,
})
const positionSchema = z.object({
  id: z.string(), positionKey: z.string(), strategyHash: z.string(), policyHash: z.string(), strategy: z.string(),
  salt: z.string(), encodingVersion: z.number().int(), active: z.boolean(), docked: z.boolean(), initialized: z.boolean(),
  runtimeVersion: z.string(), sufficientlyAllocated: z.boolean(), baseAllocationRaw: z.string(),
  quoteAllocationRaw: z.string(), createdBlock: z.string(), createdTimestamp: z.string(), createdTransaction: z.string(),
  lastUpdateBlock: z.string(), lastUpdateTimestamp: z.string(), lastUpdateTransaction: z.string(),
  maker: z.object({ address: z.string() }), market: z.object({ id: z.string(), marketId: z.string() }),
  baseToken: tokenSchema, quoteToken: tokenSchema, sides: z.array(sideSchema),
})
const fillSchema = z.object({
  id: z.string(), routeId: z.string(), fillIndex: z.number().int(), side: z.enum(['SELL', 'BUY']),
  amountInRaw: z.string(), amountOutRaw: z.string(), blockNumber: z.string(), timestamp: z.string(),
  transactionHash: z.string(), position: z.object({ id: z.string() }),
  market: z.object({ id: z.string(), marketId: z.string() }), maker: z.object({ address: z.string() }),
  tokenIn: tokenSchema, tokenOut: tokenSchema,
})
const routeSchema = z.object({
  id: z.string(), routeId: z.string(), side: z.enum(['SELL', 'BUY']), amountInRaw: z.string(),
  amountOutRaw: z.string(), blockNumber: z.string(), timestamp: z.string(), transactionHash: z.string(),
  market: z.object({ id: z.string(), marketId: z.string() }), tokenIn: tokenSchema, tokenOut: tokenSchema,
})

export interface ProductTokenRecord {
  address: Address
  symbol: string
  name: string
  decimals: number
}

export interface ProductMarketRecord {
  id: Hex
  positionCount: bigint
  activePositionCount: bigint
  fillCount: bigint
  routeCount: bigint
  volumeBaseRaw: bigint
  volumeQuoteRaw: bigint
  lastUpdateBlock: bigint
  lastUpdateTimestamp: bigint
  baseToken: ProductTokenRecord
  quoteToken: ProductTokenRecord
  bestBidWad: bigint | null
  bestAskWad: bigint | null
  activeSellSides: number
  activeBuySides: number
  dayFillCount: bigint
  dayRouteCount: bigint
  dayVolumeBaseRaw: bigint
  dayVolumeQuoteRaw: bigint
}

export interface ProductSideRecord {
  side: 'sell' | 'buy'
  branch: 'general' | 'native-alpha-zero' | 'native-alpha-one' | 'flat'
  startPriceWad: bigint
  endPriceWad: bigint
  alphaWad: bigint
  initialReserveWad: bigint
  yWad: bigint
  yIntWad: bigint
  currentPriceWad: bigint
  aquaAllocationRaw: bigint
  active: boolean
  lastUpdateBlock: bigint
  tokenIn: ProductTokenRecord
  tokenOut: ProductTokenRecord
}

export interface ProductPositionRecord {
  id: Hex
  positionKey: Hex
  strategyHash: Hex
  policyHash: Hex
  strategy: Hex
  salt: Hex
  encodingVersion: number
  active: boolean
  docked: boolean
  initialized: boolean
  runtimeVersion: bigint
  sufficientlyAllocated: boolean
  baseAllocationRaw: bigint
  quoteAllocationRaw: bigint
  createdBlock: bigint
  createdTimestamp: bigint
  createdTransaction: Hex
  lastUpdateBlock: bigint
  lastUpdateTimestamp: bigint
  lastUpdateTransaction: Hex
  maker: Address
  marketId: Hex
  baseToken: ProductTokenRecord
  quoteToken: ProductTokenRecord
  sides: ProductSideRecord[]
}

export type ProductActivityRecord =
  | { type: 'fill'; id: string; routeId: Hex; positionId: Hex; marketId: Hex; maker: Address; side: 'sell' | 'buy'; amountInRaw: bigint; amountOutRaw: bigint; tokenIn: ProductTokenRecord; tokenOut: ProductTokenRecord; blockNumber: bigint; timestamp: bigint; transactionHash: Hex }
  | { type: 'route'; id: string; routeId: Hex; marketId: Hex; side: 'sell' | 'buy'; amountInRaw: bigint; amountOutRaw: bigint; tokenIn: ProductTokenRecord; tokenOut: ProductTokenRecord; blockNumber: bigint; timestamp: bigint; transactionHash: Hex }
  | { type: 'published' | 'docked'; id: string; position: ProductPositionRecord; blockNumber: bigint; timestamp: bigint; transactionHash: Hex }

export interface ProductGraphSnapshot<T> extends GraphHealth {
  items: T[]
}

export interface ProductPositionFilter {
  marketId?: Hex
  maker?: Address
  lifecycle?: 'unknown' | 'active' | 'docked'
}

export interface ProductActivityFilter {
  marketId?: Hex
  maker?: Address
  type?: 'position-published' | 'curve-filled' | 'route-executed' | 'position-docked'
}

export interface ProductGraphGateway {
  markets(signal?: AbortSignal): Promise<ProductGraphSnapshot<ProductMarketRecord>>
  positions(filter: ProductPositionFilter, signal?: AbortSignal): Promise<ProductGraphSnapshot<ProductPositionRecord>>
  position(id: Hex, signal?: AbortSignal): Promise<ProductGraphSnapshot<ProductPositionRecord>>
  activity(filter: ProductActivityFilter, signal?: AbortSignal): Promise<ProductGraphSnapshot<ProductActivityRecord>>
}

export interface ProductGraphClientOptions {
  endpoint: string
  pageSize?: number
  maxPages?: number
  timeoutMs?: number
  fetch?: typeof globalThis.fetch
  now?: () => Date
}

export class LiquidOBProductGraphClient implements ProductGraphGateway {
  readonly #endpoint: string
  readonly #pageSize: number
  readonly #maxPages: number
  readonly #timeoutMs: number
  readonly #fetch: typeof globalThis.fetch
  readonly #now: () => Date

  constructor(options: ProductGraphClientOptions) {
    this.#endpoint = options.endpoint
    this.#pageSize = options.pageSize ?? 200
    this.#maxPages = options.maxPages ?? 100
    this.#timeoutMs = options.timeoutMs ?? 8_000
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#now = options.now ?? (() => new Date())
  }

  async markets(signal?: AbortSignal): Promise<ProductGraphSnapshot<ProductMarketRecord>> {
    const meta = await this.#health(signal)
    assertHealthy(meta)
    const block = safeBlock(meta.indexedBlock)
    const [markets, sides, snapshots] = await Promise.all([
      this.#paginate(MARKETS_QUERY, 'markets', marketSchema, { block }, meta, signal),
      this.#paginate(MARKET_SIDES_QUERY, 'curveSides', marketSideSchema, { block }, meta, signal),
      this.#paginate(SNAPSHOTS_QUERY, 'marketSnapshots', snapshotSchema, {
        block,
        day: Math.floor(this.#now().getTime() / 86_400_000),
      }, meta, signal),
    ])
    const prices = new Map<string, { bid: bigint | null; ask: bigint | null; sells: number; buys: number }>()
    for (const side of sides) {
      const entry = prices.get(side.market.id) ?? { bid: null, ask: null, sells: 0, buys: 0 }
      const price = BigInt(side.currentPriceWad)
      if (side.side === 'BUY') {
        entry.buys += 1
        if (entry.bid === null || price > entry.bid) entry.bid = price
      } else {
        entry.sells += 1
        if (entry.ask === null || price < entry.ask) entry.ask = price
      }
      prices.set(side.market.id, entry)
    }
    const byMarket = new Map(snapshots.map((snapshot) => [snapshot.market.id, snapshot]))
    return {
      ...meta,
      items: markets.map((market) => {
        const price = prices.get(market.id) ?? { bid: null, ask: null, sells: 0, buys: 0 }
        const day = byMarket.get(market.id)
        return {
          id: asHex(market.marketId, 'market id'),
          positionCount: BigInt(market.positionCount),
          activePositionCount: BigInt(market.activePositionCount),
          fillCount: BigInt(market.fillCount),
          routeCount: BigInt(market.routeCount),
          volumeBaseRaw: BigInt(market.volumeBaseRaw),
          volumeQuoteRaw: BigInt(market.volumeQuoteRaw),
          lastUpdateBlock: BigInt(market.lastUpdateBlock),
          lastUpdateTimestamp: BigInt(market.lastUpdateTimestamp),
          baseToken: normalizeToken(market.baseToken),
          quoteToken: normalizeToken(market.quoteToken),
          bestBidWad: price.bid,
          bestAskWad: price.ask,
          activeSellSides: price.sells,
          activeBuySides: price.buys,
          dayFillCount: BigInt(day?.fillCount ?? '0'),
          dayRouteCount: BigInt(day?.routeCount ?? '0'),
          dayVolumeBaseRaw: BigInt(day?.volumeBaseRaw ?? '0'),
          dayVolumeQuoteRaw: BigInt(day?.volumeQuoteRaw ?? '0'),
        }
      }),
    }
  }

  async positions(filter: ProductPositionFilter, signal?: AbortSignal): Promise<ProductGraphSnapshot<ProductPositionRecord>> {
    const meta = await this.#health(signal)
    assertHealthy(meta)
    const where: Record<string, unknown> = {}
    if (filter.marketId !== undefined) where.market = filter.marketId.toLowerCase()
    if (filter.maker !== undefined) where.maker = filter.maker.toLowerCase()
    if (filter.lifecycle === 'active') where.active = true
    if (filter.lifecycle === 'docked') where.docked = true
    const rows = await this.#paginate(
      POSITIONS_QUERY,
      'positions',
      positionSchema,
      { block: safeBlock(meta.indexedBlock), where },
      meta,
      signal,
    )
    return { ...meta, items: rows.map(normalizePosition) }
  }

  async position(id: Hex, signal?: AbortSignal): Promise<ProductGraphSnapshot<ProductPositionRecord>> {
    const snapshot = await this.positions({}, signal)
    const position = snapshot.items.find((item) => item.id.toLowerCase() === id.toLowerCase())
    if (position === undefined) throw new ApiError('INVALID_REQUEST', 404, 'Position not found')
    return { ...snapshot, items: [position] }
  }

  async activity(filter: ProductActivityFilter, signal?: AbortSignal): Promise<ProductGraphSnapshot<ProductActivityRecord>> {
    const meta = await this.#health(signal)
    assertHealthy(meta)
    const block = safeBlock(meta.indexedBlock)
    const market = filter.marketId?.toLowerCase()
    const maker = filter.maker?.toLowerCase()
    const first = Math.min(this.#pageSize * 2, 1_000)
    const records: ProductActivityRecord[] = []
    if (filter.type === undefined || filter.type === 'curve-filled') {
      const where: Record<string, unknown> = {}
      if (market !== undefined) where.market = market
      if (maker !== undefined) where.maker = maker
      const rows = await this.#single(FILLS_QUERY, 'fills', fillSchema, { block, where, first }, meta, signal)
      records.push(...rows.map(normalizeFill))
    }
    if ((filter.type === undefined || filter.type === 'route-executed') && maker === undefined) {
      const where: Record<string, unknown> = {}
      if (market !== undefined) where.market = market
      const rows = await this.#single(ROUTES_QUERY, 'routes', routeSchema, { block, where, first }, meta, signal)
      records.push(...rows.map(normalizeRoute))
    }
    if (filter.type === undefined || filter.type === 'position-published' || filter.type === 'position-docked') {
      const positions = await this.positions({
        ...(filter.marketId === undefined ? {} : { marketId: filter.marketId }),
        ...(filter.maker === undefined ? {} : { maker: filter.maker }),
      }, signal)
      for (const position of positions.items) {
        if (filter.type === undefined || filter.type === 'position-published') {
          records.push({
            type: 'published', id: `published-${position.id}`, position,
            blockNumber: position.createdBlock, timestamp: position.createdTimestamp,
            transactionHash: position.createdTransaction,
          })
        }
        if (position.docked && (filter.type === undefined || filter.type === 'position-docked')) {
          records.push({
            type: 'docked', id: `docked-${position.id}`, position,
            blockNumber: position.lastUpdateBlock, timestamp: position.lastUpdateTimestamp,
            transactionHash: position.lastUpdateTransaction,
          })
        }
      }
    }
    records.sort((left, right) => left.blockNumber === right.blockNumber
      ? left.id.localeCompare(right.id)
      : left.blockNumber > right.blockNumber ? -1 : 1)
    return { ...meta, items: records }
  }

  async #health(signal?: AbortSignal): Promise<GraphHealth> {
    const body = await this.#request(HEALTH_QUERY, {}, signal)
    const parsed = envelope(z.object({ _meta: metaSchema })).parse(body)
    const data = requireData(parsed)
    return {
      indexedBlock: BigInt(data._meta.block.number),
      indexedBlockHash: data._meta.block.hash === null ? null : asHex(data._meta.block.hash, 'block hash'),
      indexingErrors: data._meta.hasIndexingErrors,
    }
  }

  async #paginate<T extends z.ZodTypeAny>(
    query: string,
    field: string,
    schema: T,
    variables: Record<string, unknown>,
    meta: GraphHealth,
    signal?: AbortSignal,
  ): Promise<Array<z.infer<T>>> {
    const rows: Array<z.infer<T>> = []
    for (let page = 0; page < this.#maxPages; page += 1) {
      const batch = await this.#single(query, field, schema, {
        ...variables,
        first: this.#pageSize,
        skip: page * this.#pageSize,
      }, meta, signal)
      rows.push(...batch)
      if (batch.length < this.#pageSize) return rows
    }
    throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, `${field} pagination exceeded configured maximum`)
  }

  async #single<T extends z.ZodTypeAny>(
    query: string,
    field: string,
    schema: T,
    variables: Record<string, unknown>,
    meta: GraphHealth,
    signal?: AbortSignal,
  ): Promise<Array<z.infer<T>>> {
    const dataSchema = z.object({ _meta: metaSchema }).catchall(z.unknown())
    const parsed = envelope(dataSchema).parse(await this.#request(query, variables, signal))
    const data = requireData(parsed)
    if (BigInt(data._meta.block.number) !== meta.indexedBlock) {
      throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Pinned product query returned a different block')
    }
    return z.array(schema).parse(data[field])
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
      throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, `Product Graph request failed: ${message(error)}`)
    }
  }
}

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    data: data.optional(),
    errors: z.array(z.object({ message: z.string() })).optional(),
  })
}

function requireData<T>(payload: { data?: T | undefined; errors?: Array<{ message: string }> | undefined }): T {
  if (payload.errors?.length) {
    throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, payload.errors.map((error) => error.message).join('; '))
  }
  if (payload.data === undefined) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Subgraph response has no data')
  return payload.data
}

function normalizePosition(row: z.infer<typeof positionSchema>): ProductPositionRecord {
  return {
    id: asHex(row.id, 'position id'), positionKey: asHex(row.positionKey, 'position key'),
    strategyHash: asHex(row.strategyHash, 'strategy hash'), policyHash: asHex(row.policyHash, 'policy hash'),
    strategy: asHex(row.strategy, 'strategy'), salt: asHex(row.salt, 'salt'), encodingVersion: row.encodingVersion,
    active: row.active, docked: row.docked, initialized: row.initialized,
    runtimeVersion: BigInt(row.runtimeVersion), sufficientlyAllocated: row.sufficientlyAllocated,
    baseAllocationRaw: BigInt(row.baseAllocationRaw), quoteAllocationRaw: BigInt(row.quoteAllocationRaw),
    createdBlock: BigInt(row.createdBlock), createdTimestamp: BigInt(row.createdTimestamp),
    createdTransaction: asHex(row.createdTransaction, 'created transaction'),
    lastUpdateBlock: BigInt(row.lastUpdateBlock), lastUpdateTimestamp: BigInt(row.lastUpdateTimestamp),
    lastUpdateTransaction: asHex(row.lastUpdateTransaction, 'last transaction'), maker: asAddress(row.maker.address, 'maker'),
    marketId: asHex(row.market.marketId, 'market id'), baseToken: normalizeToken(row.baseToken),
    quoteToken: normalizeToken(row.quoteToken), sides: row.sides.map(normalizeSide),
  }
}

function normalizeSide(row: z.infer<typeof sideSchema>): ProductSideRecord {
  return {
    side: row.side === 'SELL' ? 'sell' : 'buy', branch: branch(row.branch),
    startPriceWad: BigInt(row.startPriceWad), endPriceWad: BigInt(row.endPriceWad), alphaWad: BigInt(row.alphaWad),
    initialReserveWad: BigInt(row.initialReserveWad), yWad: BigInt(row.yWad), yIntWad: BigInt(row.yIntWad),
    currentPriceWad: BigInt(row.currentPriceWad), aquaAllocationRaw: BigInt(row.aquaAllocationRaw),
    active: row.active, lastUpdateBlock: BigInt(row.lastUpdateBlock), tokenIn: normalizeToken(row.tokenIn),
    tokenOut: normalizeToken(row.tokenOut),
  }
}

function normalizeFill(row: z.infer<typeof fillSchema>): ProductActivityRecord {
  return {
    type: 'fill', id: row.id, routeId: asHex(row.routeId, 'route id'), positionId: asHex(row.position.id, 'position id'),
    marketId: asHex(row.market.marketId, 'market id'), maker: asAddress(row.maker.address, 'maker'),
    side: row.side === 'SELL' ? 'sell' : 'buy', amountInRaw: BigInt(row.amountInRaw), amountOutRaw: BigInt(row.amountOutRaw),
    tokenIn: normalizeToken(row.tokenIn), tokenOut: normalizeToken(row.tokenOut), blockNumber: BigInt(row.blockNumber),
    timestamp: BigInt(row.timestamp), transactionHash: asHex(row.transactionHash, 'transaction hash'),
  }
}

function normalizeRoute(row: z.infer<typeof routeSchema>): ProductActivityRecord {
  return {
    type: 'route', id: row.id, routeId: asHex(row.routeId, 'route id'), marketId: asHex(row.market.marketId, 'market id'),
    side: row.side === 'SELL' ? 'sell' : 'buy', amountInRaw: BigInt(row.amountInRaw), amountOutRaw: BigInt(row.amountOutRaw),
    tokenIn: normalizeToken(row.tokenIn), tokenOut: normalizeToken(row.tokenOut), blockNumber: BigInt(row.blockNumber),
    timestamp: BigInt(row.timestamp), transactionHash: asHex(row.transactionHash, 'transaction hash'),
  }
}

function normalizeToken(value: z.infer<typeof tokenSchema>): ProductTokenRecord {
  return { address: asAddress(value.address, 'token'), symbol: value.symbol, name: value.name, decimals: value.decimals }
}

function branch(value: z.infer<typeof sideSchema>['branch']): ProductSideRecord['branch'] {
  if (value === 'NATIVE_ALPHA_ZERO') return 'native-alpha-zero'
  if (value === 'NATIVE_ALPHA_ONE') return 'native-alpha-one'
  return value === 'FLAT' ? 'flat' : 'general'
}

function assertHealthy(meta: GraphHealth): void {
  if (meta.indexingErrors) throw new ApiError('SUBGRAPH_INDEXING_ERROR', 503, 'Subgraph reports indexing errors')
}

function safeBlock(value: bigint): number {
  const block = Number(value)
  if (!Number.isSafeInteger(block)) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, 'Indexed block exceeds Graph query range')
  return block
}

function asHex(value: string, label: string): Hex {
  if (!isHex(value)) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, `Invalid indexed ${label}`)
  return value
}

function asAddress(value: string, label: string): Address {
  if (!isAddress(value)) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, `Invalid indexed ${label}`)
  return value
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}
