import {
  formatUnits,
  formatWad,
  tokenAmount,
  wadToRawDown,
  type ActivityItem,
  type ActivityQuery,
  type AssetBackingView,
  type BackingStatus,
  type CurveBranch,
  type CurveSample,
  type CurveSide,
  type CurveView,
  type DataMeta,
  type DisplayPrice,
  type FrontendBootstrap,
  type MarketDetail,
  type MarketQuery,
  type MarketSummary,
  type Page,
  type PositionDetail,
  type PositionLifecycle,
  type PositionQuery,
  type PositionSummary,
  type RawAmount,
  type Token,
  type WadInteger,
} from '@liquid-ob/frontend-api'
import type { DeploymentManifest } from '@liquid-ob/contracts'
import { WAD, compileCurve, marginalPriceWad } from '@liquid-ob/curve-math'
import type { Address, Hex } from 'viem'

import { ApiError } from './errors.js'
import type { LensAssetBacking, LensPositionSnapshot } from './onchain.js'
import type {
  ProductActivityFilter,
  ProductActivityRecord,
  ProductGraphGateway,
  ProductGraphSnapshot,
  ProductMarketRecord,
  ProductPositionFilter,
  ProductPositionRecord,
  ProductSideRecord,
  ProductTokenRecord,
} from './product-graph.js'
import type { ChainHealth } from './types.js'

export interface ProductChainGateway {
  health(): Promise<ChainHealth>
  readPosition(position: { maker: Address; strategyHash: Hex; strategy: Hex }): Promise<LensPositionSnapshot>
}

export interface ProductServiceConfig {
  manifest: DeploymentManifest
  maxIndexLag: bigint
  now?: () => Date
}

export class ProductService {
  readonly #graph: ProductGraphGateway
  readonly #chain: ProductChainGateway
  readonly #manifest: DeploymentManifest
  readonly #maxIndexLag: bigint
  readonly #now: () => Date

  constructor(graph: ProductGraphGateway, chain: ProductChainGateway, config: ProductServiceConfig) {
    this.#graph = graph
    this.#chain = chain
    this.#manifest = config.manifest
    this.#maxIndexLag = config.maxIndexLag
    this.#now = config.now ?? (() => new Date())
  }

  async bootstrap(signal?: AbortSignal): Promise<FrontendBootstrap> {
    const [snapshot, chain] = await Promise.all([this.#graph.markets(signal), this.#chain.health()])
    const meta = this.#meta(snapshot, chain)
    const tokens = uniqueTokens(snapshot.items.flatMap((market) => [market.baseToken, market.quoteToken]))
      .map((token) => productToken(token, this.#manifest.network.chainId))
    const healthy = !meta.stale && !snapshot.indexingErrors
    const publicRelease = this.#manifest.release.public
    return {
      protocolName: 'ArcBook',
      protocolVersion: this.#manifest.protocolVersion,
      mode: 'live',
      network: {
        chainId: this.#manifest.network.chainId,
        name: this.#manifest.network.name,
        explorerUrl: this.#manifest.network.explorerUrl,
        nativeCurrencySymbol: this.#manifest.network.nativeCurrencySymbol,
      },
      deploymentBlock: this.#manifest.release.deploymentBlock,
      addresses: {
        aqua: this.#manifest.contracts.aqua.address,
        swapVmRouter: this.#manifest.contracts.router.address,
        curveKernel: this.#manifest.contracts.curveKernel.address,
        liquidOBRouter: this.#manifest.contracts.router.address,
        quoter: this.#manifest.contracts.quoter.address,
        lens: this.#manifest.contracts.lens.address,
        batchExecutor: this.#manifest.contracts.batchExecutor.address,
      },
      services: [
        { name: 'rpc', health: 'healthy', url: this.#manifest.network.publicRpcUrl, message: `Head block ${chain.headBlock}` },
        { name: 'subgraph', health: healthy ? 'healthy' : 'degraded', url: null, message: healthy ? 'Pinned indexed snapshot is fresh' : meta.warnings.join('; ') },
        { name: 'solver', health: healthy ? 'healthy' : 'degraded', url: null, message: healthy ? 'Route service is ready' : 'Quotes fail closed while indexing is stale' },
      ],
      features: {
        marketExplorer: true,
        makerPreview: true,
        publishPosition: publicRelease && healthy,
        positionManagement: publicRelease && healthy,
        exactInputQuotes: healthy,
        exactOutputQuotes: healthy,
        executeRoutes: publicRelease && healthy,
        liveWrites: publicRelease && healthy,
      },
      tokens,
      meta,
    }
  }

  async markets(query: MarketQuery = {}, signal?: AbortSignal): Promise<Page<MarketSummary>> {
    const [snapshot, chain] = await Promise.all([this.#graph.markets(signal), this.#chain.health()])
    const meta = this.#meta(snapshot, chain)
    const search = query.search?.trim().toLowerCase()
    const rows = search === undefined || search === ''
      ? snapshot.items
      : snapshot.items.filter((market) => `${market.baseToken.symbol}/${market.quoteToken.symbol}`.toLowerCase().includes(search))
    return page(rows.map((market) => this.#market(market)), query.cursor, query.limit, meta)
  }

  async market(marketId: Hex, signal?: AbortSignal): Promise<MarketDetail> {
    const [snapshot, chain] = await Promise.all([this.#graph.markets(signal), this.#chain.health()])
    const record = snapshot.items.find((market) => sameHex(market.id, marketId))
    if (record === undefined) throw new ApiError('INVALID_REQUEST', 404, 'Market not found')
    return { ...this.#market(record), recentRouteIds: [], meta: this.#meta(snapshot, chain) }
  }

  async positions(query: PositionQuery = {}, signal?: AbortSignal): Promise<Page<PositionSummary>> {
    const filter: ProductPositionFilter = {
      ...(query.marketId === undefined ? {} : { marketId: query.marketId }),
      ...(query.maker === undefined ? {} : { maker: query.maker }),
      ...(query.lifecycle === undefined ? {} : { lifecycle: query.lifecycle }),
    }
    const [snapshot, chain] = await Promise.all([this.#graph.positions(filter, signal), this.#chain.health()])
    const meta = this.#meta(snapshot, chain)
    const records = query.side === undefined
      ? snapshot.items
      : snapshot.items.filter((position) => position.sides.some((side) => side.side === query.side && side.active && side.yWad > 0n))
    return page(records.map((position) => positionSummary(position, this.#manifest.network.chainId)), query.cursor, query.limit, meta)
  }

  async position(positionId: Hex, signal?: AbortSignal): Promise<PositionDetail> {
    const [snapshot, chain] = await Promise.all([this.#graph.position(positionId, signal), this.#chain.health()])
    const record = snapshot.items[0]
    if (record === undefined) throw new ApiError('INVALID_REQUEST', 404, 'Position not found')
    const lens = await this.#chain.readPosition({
      maker: record.maker,
      strategyHash: record.strategyHash,
      strategy: record.strategy,
    })
    verifyLensIdentity(record, lens)
    const meta = this.#meta(snapshot, chain)
    const summary = positionSummaryFromLens(record, lens, this.#manifest.network.chainId)
    const base = productToken(record.baseToken, this.#manifest.network.chainId)
    const quote = productToken(record.quoteToken, this.#manifest.network.chainId)
    const warnings = [...meta.warnings]
    if (!lens.baseBacking.sufficientlyBacked) warnings.push('Base-side backing is insufficient')
    if (!lens.quoteBacking.sufficientlyBacked) warnings.push('Quote-side backing is insufficient')
    return {
      ...summary,
      encodingVersion: lens.encodingVersion,
      salt: record.salt,
      strategy: record.strategy,
      baseBacking: backing(base, lens.baseBacking),
      quoteBacking: backing(quote, lens.quoteBacking),
      createdAtBlock: safeNumber(record.createdBlock, 'created block'),
      createdTransaction: record.createdTransaction,
      warnings,
      meta,
    }
  }

  async activity(query: ActivityQuery = {}, signal?: AbortSignal): Promise<Page<ActivityItem>> {
    const filter: ProductActivityFilter = {
      ...(query.marketId === undefined ? {} : { marketId: query.marketId }),
      ...(query.maker === undefined ? {} : { maker: query.maker }),
      ...(query.type === undefined ? {} : { type: query.type }),
    }
    const [snapshot, chain] = await Promise.all([this.#graph.activity(filter, signal), this.#chain.health()])
    const meta = this.#meta(snapshot, chain)
    return page(snapshot.items.map((item) => activity(item, this.#manifest.network.chainId)), query.cursor, query.limit, meta)
  }

  #market(record: ProductMarketRecord): MarketSummary {
    const base = productToken(record.baseToken, this.#manifest.network.chainId)
    const quote = productToken(record.quoteToken, this.#manifest.network.chainId)
    return {
      id: record.id,
      baseToken: base,
      quoteToken: quote,
      bestBid: record.bestBidWad === null ? null : displayPrice(base, quote, record.bestBidWad),
      bestAsk: record.bestAskWad === null ? null : displayPrice(base, quote, record.bestAskWad),
      spreadBps: spread(record.bestBidWad, record.bestAskWad),
      stats: {
        activePositions: safeNumber(record.activePositionCount, 'active position count'),
        activeSellSides: record.activeSellSides,
        activeBuySides: record.activeBuySides,
        fillCount24h: safeNumber(record.dayFillCount, 'daily fill count'),
        volumeQuote24h: tokenAmount(quote, raw(record.dayVolumeQuoteRaw), 6),
      },
      lastUpdateBlock: safeNumber(record.lastUpdateBlock, 'market update block'),
    }
  }

  #meta<T>(snapshot: ProductGraphSnapshot<T>, chain: ChainHealth): DataMeta {
    if (chain.chainId !== this.#manifest.network.chainId) {
      throw new ApiError('CHAIN_MISMATCH', 503, `RPC chain ${chain.chainId} does not match ${this.#manifest.network.chainId}`)
    }
    const lag = chain.headBlock >= snapshot.indexedBlock ? chain.headBlock - snapshot.indexedBlock : null
    const stale = lag === null || lag > this.#maxIndexLag || snapshot.indexingErrors
    const warnings: string[] = []
    if (snapshot.indexingErrors) warnings.push('Subgraph reports indexing errors')
    if (lag === null) warnings.push('Indexed block is ahead of the RPC head')
    else if (lag > this.#maxIndexLag) warnings.push(`Subgraph is ${lag} blocks behind the RPC head`)
    return {
      mode: 'live',
      source: 'composed',
      generatedAt: this.#now().toISOString(),
      chainHeadBlock: safeNumber(chain.headBlock, 'chain head'),
      indexedBlock: safeNumber(snapshot.indexedBlock, 'indexed block'),
      indexLag: lag === null ? null : safeNumber(lag, 'index lag'),
      stale,
      warnings,
    }
  }
}

function positionSummary(record: ProductPositionRecord, chainId: number): PositionSummary {
  const sell = requiredSide(record, 'sell')
  const buy = requiredSide(record, 'buy')
  const base = productToken(record.baseToken, chainId)
  const quote = productToken(record.quoteToken, chainId)
  return {
    id: record.id,
    positionKey: record.positionKey,
    strategyHash: record.strategyHash,
    policyHash: record.policyHash,
    marketId: record.marketId,
    maker: record.maker,
    lifecycle: lifecycle(record.active, record.docked),
    runtimeVersion: safeNumber(record.runtimeVersion, 'runtime version'),
    sell: curveView(sell, base, quote),
    buy: curveView(buy, base, quote),
    sufficientlyBacked: record.sufficientlyAllocated,
    lastUpdateBlock: safeNumber(record.lastUpdateBlock, 'position update block'),
  }
}

function positionSummaryFromLens(
  record: ProductPositionRecord,
  lens: LensPositionSnapshot,
  chainId: number,
): PositionSummary {
  const base = productToken(record.baseToken, chainId)
  const quote = productToken(record.quoteToken, chainId)
  const sellIndexed = requiredSide(record, 'sell')
  const buyIndexed = requiredSide(record, 'buy')
  const sell: ProductSideRecord = {
    ...sellIndexed,
    startPriceWad: lens.config.sell.startPrice,
    endPriceWad: lens.config.sell.endPrice,
    alphaWad: lens.config.sell.alpha,
    initialReserveWad: lens.config.sell.initialReserve,
    yWad: lens.runtime.sell.y,
    yIntWad: lens.runtime.sell.yInt,
    currentPriceWad: currentPrice(lens.config.sell, 'sell', lens.runtime.sell),
    active: lens.lifecycle === 1,
  }
  const buy: ProductSideRecord = {
    ...buyIndexed,
    startPriceWad: lens.config.buy.startPrice,
    endPriceWad: lens.config.buy.endPrice,
    alphaWad: lens.config.buy.alpha,
    initialReserveWad: lens.config.buy.initialReserve,
    yWad: lens.runtime.buy.y,
    yIntWad: lens.runtime.buy.yInt,
    currentPriceWad: currentPrice(lens.config.buy, 'buy', lens.runtime.buy),
    active: lens.lifecycle === 1,
  }
  return {
    ...positionSummary(record, chainId),
    lifecycle: lens.lifecycle === 1 ? 'active' : lens.lifecycle === 2 ? 'docked' : 'unknown',
    runtimeVersion: safeNumber(lens.runtime.version, 'runtime version'),
    sell: curveView(sell, base, quote),
    buy: curveView(buy, base, quote),
    sufficientlyBacked: lens.baseBacking.sufficientlyBacked && lens.quoteBacking.sufficientlyBacked,
  }
}

function curveView(side: ProductSideRecord, base: Token, quote: Token): CurveView {
  const outgoing = side.side === 'sell' ? base : quote
  const yRaw = wadToRawDown(side.yWad, outgoing.decimals)
  return {
    policy: {
      side: side.side,
      branch: side.branch as CurveBranch,
      startPrice: displayPrice(base, quote, side.startPriceWad),
      endPrice: displayPrice(base, quote, side.endPriceWad),
      alpha: signedWad(side.alphaWad),
      alphaWad: side.alphaWad.toString() as `${bigint}`,
      initialReserve: tokenAmount(outgoing, wadToRawDown(side.initialReserveWad, outgoing.decimals), 6),
    },
    runtime: {
      yWad: side.yWad.toString() as WadInteger,
      yIntWad: side.yIntWad.toString() as WadInteger,
      progressBps: progress(side.yWad, side.yIntWad),
      availableOutput: tokenAmount(outgoing, yRaw, 6),
      currentMarginalPrice: displayPrice(base, quote, side.currentPriceWad),
      backingStatus: backingStatus(side),
    },
    marginalSamples: samples(side, base, quote),
  }
}

function samples(side: ProductSideRecord, base: Token, quote: Token): CurveSample[] {
  const curve = compileCurve({
    startPriceWad: side.startPriceWad,
    endPriceWad: side.endPriceWad,
    alphaWad: side.alphaWad,
    initialReserveWad: WAD,
  }, side.side)
  return Array.from({ length: 21 }, (_value, index) => {
    const progressBps = index * 500
    const yWad = WAD * BigInt(10_000 - progressBps) / 10_000n
    return {
      progressBps,
      displayedMarginalPrice: displayPrice(base, quote, marginalPriceWad(curve, side.side, { yWad, yIntWad: WAD })),
      remainingReserve: formatWad(
        (side.initialReserveWad * BigInt(10_000 - progressBps) / 10_000n).toString() as WadInteger,
        6,
      ),
    }
  })
}

function currentPrice(
  config: { startPrice: bigint; endPrice: bigint; alpha: bigint; initialReserve: bigint },
  side: CurveSide,
  state: { y: bigint; yInt: bigint },
): bigint {
  if (state.yInt === 0n) return config.startPrice
  return marginalPriceWad(compileCurve({
    startPriceWad: config.startPrice,
    endPriceWad: config.endPrice,
    alphaWad: config.alpha,
    initialReserveWad: config.initialReserve,
  }, side), side, { yWad: state.y, yIntWad: state.yInt })
}

function backing(token: Token, value: LensAssetBacking): AssetBackingView {
  return {
    token,
    aquaAllocation: tokenAmount(token, raw(value.aquaAllocation), 6),
    walletBalance: tokenAmount(token, raw(value.walletBalance), 6),
    aquaAllowance: tokenAmount(token, raw(value.aquaAllowance), 6),
    logicalOutgoing: tokenAmount(token, wadToRawDown(value.logicalOutgoing, token.decimals), 6),
    sufficientlyBacked: value.sufficientlyBacked,
  }
}

function activity(record: ProductActivityRecord, chainId: number): ActivityItem {
  if ('position' in record) {
    return {
      id: record.id,
      type: record.type === 'published' ? 'position-published' : 'position-docked',
      marketId: record.position.marketId,
      positionId: record.position.id,
      routeId: null,
      maker: record.position.maker,
      side: null,
      amountIn: null,
      amountOut: null,
      blockNumber: safeNumber(record.blockNumber, 'activity block'),
      transactionHash: record.transactionHash,
      timestamp: iso(record.timestamp),
    }
  }
  const tokenIn = productToken(record.tokenIn, chainId)
  const tokenOut = productToken(record.tokenOut, chainId)
  return {
    id: record.id,
    type: record.type === 'fill' ? 'curve-filled' : 'route-executed',
    marketId: record.marketId,
    positionId: record.type === 'fill' ? record.positionId : null,
    routeId: record.routeId,
    maker: record.type === 'fill' ? record.maker : null,
    side: record.side,
    amountIn: tokenAmount(tokenIn, raw(record.amountInRaw), 6),
    amountOut: tokenAmount(tokenOut, raw(record.amountOutRaw), 6),
    blockNumber: safeNumber(record.blockNumber, 'activity block'),
    transactionHash: record.transactionHash,
    timestamp: iso(record.timestamp),
  }
}

function requiredSide(position: ProductPositionRecord, side: CurveSide): ProductSideRecord {
  const value = position.sides.find((entry) => entry.side === side)
  if (value === undefined) throw new ApiError('SUBGRAPH_UNAVAILABLE', 503, `Position ${position.id} has no ${side} side`)
  return value
}

function verifyLensIdentity(record: ProductPositionRecord, lens: LensPositionSnapshot): void {
  if (!sameHex(record.id, lens.positionId) || !sameHex(record.positionKey, lens.positionKey)
    || !sameHex(record.strategyHash, lens.strategyHash) || !sameHex(record.marketId, lens.marketId)
    || record.maker.toLowerCase() !== lens.maker.toLowerCase()) {
    throw new ApiError('RPC_UNAVAILABLE', 503, 'Lens and Subgraph disagree on position identity')
  }
}

function productToken(record: ProductTokenRecord, chainId: number): Token {
  return { ...record, chainId }
}

function uniqueTokens(tokens: ProductTokenRecord[]): ProductTokenRecord[] {
  const seen = new Set<string>()
  return tokens.filter((token) => {
    const key = token.address.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function displayPrice(base: Token, quote: Token, wad: bigint): DisplayPrice {
  return {
    baseToken: base.address,
    quoteToken: quote.address,
    wad: wad.toString() as WadInteger,
    formatted: formatWad(wad.toString() as WadInteger, 8),
  }
}

function signedWad(value: bigint): string {
  const negative = value < 0n
  const formatted = formatUnits((negative ? -value : value).toString() as RawAmount, 18, 8)
  return negative ? `-${formatted}` : formatted
}

function progress(yWad: bigint, yIntWad: bigint): number {
  if (yIntWad === 0n) return 0
  return Number((yIntWad - yWad) * 10_000n / yIntWad)
}

function backingStatus(side: ProductSideRecord): BackingStatus {
  if (!side.active) return 'unavailable'
  const required = BigInt(wadToRawDown(side.yWad, side.tokenOut.decimals))
  return side.aquaAllocationRaw >= required ? 'backed' : 'warning'
}

function lifecycle(active: boolean, docked: boolean): PositionLifecycle {
  return docked ? 'docked' : active ? 'active' : 'unknown'
}

function spread(bid: bigint | null, ask: bigint | null): number | null {
  if (bid === null || ask === null || ask + bid === 0n) return null
  return Number((ask - bid) * 20_000n / (ask + bid))
}

function page<T>(items: T[], cursor = '0', requestedLimit = 50, meta: DataMeta): Page<T> {
  const offset = Number(cursor)
  const limit = Math.min(Math.max(requestedLimit, 1), 100)
  if (!Number.isSafeInteger(offset) || offset < 0) throw new ApiError('INVALID_REQUEST', 400, 'Invalid pagination cursor')
  const values = items.slice(offset, offset + limit)
  const next = offset + values.length
  return {
    items: values,
    pageInfo: { cursor: next < items.length ? String(next) : null, hasNextPage: next < items.length, totalCount: items.length },
    meta,
  }
}

function raw(value: bigint): RawAmount {
  return value.toString() as RawAmount
}

function safeNumber(value: bigint, label: string): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) throw new ApiError('INTERNAL_ERROR', 500, `${label} exceeds JSON integer range`)
  return result
}

function iso(timestamp: bigint): string {
  const milliseconds = Number(timestamp * 1_000n)
  if (!Number.isSafeInteger(milliseconds)) throw new ApiError('INTERNAL_ERROR', 500, 'Timestamp exceeds JavaScript range')
  return new Date(milliseconds).toISOString()
}

function sameHex(left: Hex, right: Hex): boolean {
  return left.toLowerCase() === right.toLowerCase()
}
