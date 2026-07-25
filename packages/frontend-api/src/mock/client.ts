import type { LiquidOBFrontendClient, RequestOptions } from '../client.js'
import { FrontendGatewayError } from '../errors.js'
import {
  formatWad,
  mulDivDown,
  mulDivUp,
  parseSignedWad,
  parseUnits,
  parseWad,
  rawToWad,
  tokenAmount,
  wadToRawDown,
  wadToRawUp,
} from '../amounts.js'
import type {
  ActivityItem,
  ActivityQuery,
  Address,
  Bytes32,
  CurveDraft,
  CurveDraftPreview,
  CurveSide,
  DataMeta,
  DisplayPrice,
  DockPositionRequest,
  ExecuteRouteRequest,
  FrontendBootstrap,
  Hex,
  MarketDetail,
  MarketQuery,
  MarketSummary,
  Page,
  PositionDetail,
  PositionDraft,
  PositionPreview,
  PositionQuery,
  PositionSummary,
  PreparedTransaction,
  PublishPositionRequest,
  QuoteKind,
  QuoteRequest,
  RawAmount,
  ReplacePositionRequest,
  RouteFillView,
  RouteQuote,
  TransactionPlan,
  TransactionStep,
  ValidationIssue,
  WadInteger,
} from '../types.js'
import {
  ACTIVITY,
  BASE_TOKEN,
  BOOTSTRAP,
  MARKET,
  MARKET_ID,
  MOCK_ADDRESSES,
  MOCK_CHAIN_HEAD,
  MOCK_CHAIN_ID,
  POSITIONS,
  QUOTE_TOKEN,
  fixtureNativeRate,
  fixturePriceLabel,
  fixturePriceWad,
  mockMeta,
} from './fixtures.js'
import { displayedPrice, inferBranch, marginalSamples } from './model.js'

const WAD = 10n ** 18n
const MAX_SLIPPAGE_BPS = 5_000
const INT128_MAX = (1n << 127n) - 1n
const MAX_POWER_MAGNITUDE = 40

export interface MockLiquidOBClientOptions {
  latencyMs?: number
  now?: () => Date
}

function copy<T>(value: T): T {
  return structuredClone(value)
}

function raw(value: bigint): RawAmount {
  return value.toString() as RawAmount
}

function compareAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function splitRaw(total: bigint): [bigint, bigint] {
  const first = (total * 60n) / 100n
  if (first === 0n) return [total, 0n]
  return [first, total - first]
}

function page<T>(
  values: T[],
  cursor: string | undefined,
  requestedLimit: number | undefined,
  meta: DataMeta,
): Page<T> {
  const offset = cursor === undefined ? 0 : Number.parseInt(cursor, 10)
  const limit = Math.max(1, Math.min(requestedLimit ?? 20, 100))
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new FrontendGatewayError('INVALID_ARGUMENT', 'Cursor is invalid.')
  }
  const items = values.slice(offset, offset + limit)
  const nextOffset = offset + items.length
  return {
    items: copy(items),
    pageInfo: {
      cursor: nextOffset < values.length ? String(nextOffset) : null,
      hasNextPage: nextOffset < values.length,
      totalCount: values.length,
    },
    meta,
  }
}

export class MockLiquidOBClient implements LiquidOBFrontendClient {
  readonly mode = 'mock' as const
  readonly latencyMs: number
  readonly now: () => Date
  private quoteSequence = 0
  private planSequence = 0

  constructor(options: MockLiquidOBClientOptions = {}) {
    this.latencyMs = Math.max(0, options.latencyMs ?? 80)
    this.now = options.now ?? (() => new Date())
  }

  async getBootstrap(options?: RequestOptions): Promise<FrontendBootstrap> {
    await this.wait(options)
    return {
      ...copy(BOOTSTRAP),
      meta: this.meta(),
    }
  }

  async listMarkets(
    query: MarketQuery = {},
    options?: RequestOptions,
  ): Promise<Page<MarketSummary>> {
    await this.wait(options)
    const search = query.search?.trim().toLowerCase()
    const markets = search === undefined || search.length === 0
      || MARKET.baseToken.symbol.toLowerCase().includes(search)
      || MARKET.quoteToken.symbol.toLowerCase().includes(search)
      ? [MARKET]
      : []
    return page(markets, query.cursor, query.limit, this.meta('subgraph'))
  }

  async getMarket(
    marketId: Bytes32,
    options?: RequestOptions,
  ): Promise<MarketDetail> {
    await this.wait(options)
    this.assertMarket(marketId)
    return {
      ...copy(MARKET),
      meta: this.meta('subgraph'),
    }
  }

  async listPositions(
    query: PositionQuery = {},
    options?: RequestOptions,
  ): Promise<Page<PositionSummary>> {
    await this.wait(options)
    let positions = POSITIONS.filter((position) => {
      if (query.marketId !== undefined && position.marketId !== query.marketId) return false
      if (query.maker !== undefined && !compareAddress(position.maker, query.maker)) return false
      if (query.lifecycle !== undefined && position.lifecycle !== query.lifecycle) return false
      if (query.side !== undefined && position[query.side].runtime.availableOutput.raw === '0') {
        return false
      }
      return true
    })
    positions = positions.sort((left, right) => right.lastUpdateBlock - left.lastUpdateBlock)
    return page(positions, query.cursor, query.limit, this.meta('subgraph'))
  }

  async getPosition(
    positionId: Bytes32,
    options?: RequestOptions,
  ): Promise<PositionDetail> {
    await this.wait(options)
    const position = this.findPosition(positionId)
    return {
      ...copy(position),
      meta: this.meta('composed'),
    }
  }

  async previewPosition(
    draft: PositionDraft,
    options?: RequestOptions,
  ): Promise<PositionPreview> {
    await this.wait(options)
    const issues = this.validateDraft(draft)
    const sell = this.previewCurve(draft, 'sell', issues)
    const buy = this.previewCurve(draft, 'buy', issues)
    const sellStart = Number(draft.sell.startPrice)
    const buyStart = Number(draft.buy.startPrice)
    const initialSpreadBps = Number.isFinite(sellStart) && Number.isFinite(buyStart)
      && buyStart > 0
      ? Math.round(((sellStart - buyStart) / buyStart) * 10_000)
      : null

    return {
      draft: copy(draft),
      sell,
      buy,
      initialSpreadBps,
      canPublish: issues.every((issue) => issue.severity !== 'error'),
      issues,
      policyHash: null,
      payload: null,
      meta: {
        ...this.meta('curve-math'),
        warnings: [
          'Mock previews sample the marginal Holder schedule with JavaScript numbers.',
          'The future curve-math package supplies exact bigint commitments and payload bytes.',
        ],
      },
    }
  }

  async quote(
    request: QuoteRequest,
    options?: RequestOptions,
  ): Promise<RouteQuote> {
    await this.wait(options)
    this.assertMarket(request.marketId)
    this.assertSlippage(request.slippageBps)

    const tokenIn = request.side === 'sell' ? QUOTE_TOKEN : BASE_TOKEN
    const tokenOut = request.side === 'sell' ? BASE_TOKEN : QUOTE_TOKEN
    const fixedToken = request.kind === 'exact-input' ? tokenIn : tokenOut
    if (!compareAddress(request.amount.token, fixedToken.address)) {
      throw new FrontendGatewayError(
        'INVALID_ARGUMENT',
        `${request.kind} amount must use ${fixedToken.symbol}.`,
      )
    }

    let fixedRaw: bigint
    try {
      fixedRaw = BigInt(request.amount.raw)
    } catch {
      throw new FrontendGatewayError(
        'INVALID_AMOUNT',
        'Quote amount must be an unsigned raw integer.',
      )
    }
    if (fixedRaw <= 0n) {
      throw new FrontendGatewayError('INVALID_AMOUNT', 'Quote amount must be positive.')
    }

    const candidates = POSITIONS
      .filter((position) => position.lifecycle === 'active' && position.sufficientlyBacked)
      .sort((left, right) => {
        const leftPrice = fixturePriceWad(left, request.side)
        const rightPrice = fixturePriceWad(right, request.side)
        return request.side === 'sell'
          ? Number(leftPrice - rightPrice)
          : Number(rightPrice - leftPrice)
      })
      .slice(0, 2)

    const fixedSplits = splitRaw(fixedRaw)
    const fills = candidates.flatMap((position, index) => {
      const split = fixedSplits[index]!
      return split === 0n
        ? []
        : [this.quoteFill(position, request.side, request.kind, split, index)]
    })
    const aggregateInput = fills.reduce((sum, fill) => sum + BigInt(fill.amountIn.raw), 0n)
    const aggregateOutput = fills.reduce((sum, fill) => sum + BigInt(fill.amountOut.raw), 0n)
    if (aggregateInput === 0n || aggregateOutput === 0n) {
      throw new FrontendGatewayError(
        'INVALID_AMOUNT',
        'Quote amount is too small after token-decimal rounding.',
      )
    }
    const inputWad = rawToWad(raw(aggregateInput), tokenIn.decimals)
    const outputWad = rawToWad(raw(aggregateOutput), tokenOut.decimals)
    const baseWad = request.side === 'sell' ? outputWad : inputWad
    const quoteWad = request.side === 'sell' ? inputWad : outputWad
    const effectivePriceWad = mulDivDown(quoteWad, WAD, baseWad)
    const priceValues = fills.map((fill) => BigInt(fill.displayedPriceAfter.wad))
    const worstPriceWad = request.side === 'sell'
      ? priceValues.reduce((worst, value) => value > worst ? value : worst)
      : priceValues.reduce((worst, value) => value < worst ? value : worst)
    const bestBefore = BigInt(fills[0]!.displayedPriceBefore.wad)
    const impactNumerator = request.side === 'sell'
      ? effectivePriceWad - bestBefore
      : bestBefore - effectivePriceWad
    const priceImpactBps = Number(
      impactNumerator > 0n ? (impactNumerator * 10_000n) / bestBefore : 0n,
    )
    const limitRaw = request.kind === 'exact-input'
      ? (aggregateOutput * BigInt(10_000 - request.slippageBps)) / 10_000n
      : mulDivUp(
          aggregateInput,
          BigInt(10_000 + request.slippageBps),
          10_000n,
        )
    const now = this.now()
    const expiresAt = new Date(
      now.getTime() + ((request.deadlineSeconds ?? 60) * 1_000),
    )
    this.quoteSequence += 1

    return {
      id: `mock-quote-${this.quoteSequence}`,
      marketId: request.marketId,
      side: request.side,
      kind: request.kind,
      amountIn: tokenAmount(tokenIn, raw(aggregateInput), 8),
      amountOut: tokenAmount(tokenOut, raw(aggregateOutput), 8),
      limit: tokenAmount(
        request.kind === 'exact-input' ? tokenOut : tokenIn,
        raw(limitRaw),
        8,
      ),
      slippageBps: request.slippageBps,
      displayedEffectivePrice: this.price(effectivePriceWad),
      worstMarginalPrice: this.price(worstPriceWad),
      priceImpactBps,
      fills,
      simulation: {
        status: 'success',
        blockNumber: MOCK_CHAIN_HEAD,
        gasEstimate: raw(285_000n + (BigInt(fills.length) * 145_000n)),
        revertCode: null,
        message: 'Mock route accepted. A live adapter must replace this with eth_call.',
      },
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      meta: this.meta('solver'),
    }
  }

  async listActivity(
    query: ActivityQuery = {},
    options?: RequestOptions,
  ): Promise<Page<ActivityItem>> {
    await this.wait(options)
    const items = ACTIVITY.filter((item) => {
      if (query.marketId !== undefined && item.marketId !== query.marketId) return false
      if (query.maker !== undefined && item.maker !== null
        && !compareAddress(item.maker, query.maker)) return false
      if (query.maker !== undefined && item.maker === null) return false
      if (query.type !== undefined && item.type !== query.type) return false
      return true
    })
    return page(items, query.cursor, query.limit, this.meta('subgraph'))
  }

  async preparePublish(
    request: PublishPositionRequest,
    options?: RequestOptions,
  ): Promise<TransactionPlan> {
    const preview = await this.previewPosition(request.draft, options)
    if (!preview.canPublish) {
      throw new FrontendGatewayError('INVALID_ARGUMENT', 'Position draft is invalid.', {
        details: { issues: preview.issues },
      })
    }

    const steps: TransactionStep[] = []
    if (BigInt(preview.sell!.initialReserve.raw) > 0n) {
      steps.push(this.step(
        steps.length,
        'approve-aqua',
        'Approve base inventory',
        `Allow Aqua to use ${preview.sell!.initialReserve.formatted} ${BASE_TOKEN.symbol}.`,
        request.maker,
        BASE_TOKEN.address,
        '0x095ea7b3',
        'Approval',
      ))
    }
    if (BigInt(preview.buy!.initialReserve.raw) > 0n) {
      steps.push(this.step(
        steps.length,
        'approve-aqua',
        'Approve quote inventory',
        `Allow Aqua to use ${preview.buy!.initialReserve.formatted} ${QUOTE_TOKEN.symbol}.`,
        request.maker,
        QUOTE_TOKEN.address,
        '0x095ea7b3',
        'Approval',
      ))
    }
    steps.push(this.step(
      steps.length,
      'publish-position',
      'Publish immutable position',
      'Ship the canonical two-sided SwapVM strategy through Aqua.',
      request.maker,
      MOCK_ADDRESSES.aqua,
      '0x4c4f4231',
      'Shipped',
    ))
    return this.plan('publish', steps)
  }

  async prepareExecute(
    request: ExecuteRouteRequest,
    options?: RequestOptions,
  ): Promise<TransactionPlan> {
    await this.wait(options)
    if (request.quote.meta.mode === 'live') {
      throw new FrontendGatewayError(
        'INVALID_ARGUMENT',
        'The mock client cannot prepare a live quote.',
      )
    }
    if (new Date(request.quote.expiresAt).getTime() <= this.now().getTime()) {
      throw new FrontendGatewayError('STALE_QUOTE', 'The route quote has expired.', {
        retryable: true,
      })
    }
    if (request.quote.meta.stale || request.quote.simulation.status !== 'success') {
      throw new FrontendGatewayError(
        'SIMULATION_REVERTED',
        'The route is stale or has not passed final simulation.',
      )
    }
    const approvalAmount = request.quote.kind === 'exact-input'
      ? request.quote.amountIn
      : request.quote.limit
    const steps = [
      this.step(
        0,
        'approve-executor',
        `Approve ${request.quote.amountIn.token.symbol}`,
        `Approve at most ${approvalAmount.formatted} ${approvalAmount.token.symbol}.`,
        request.payer,
        request.quote.amountIn.token.address,
        '0x095ea7b3',
        'Approval',
      ),
      this.step(
        1,
        'execute-route',
        'Execute atomic route',
        `Settle ${request.quote.fills.length} selected maker fills atomically.`,
        request.payer,
        MOCK_ADDRESSES.batchExecutor,
        '0xfeed0001',
        'RouteExecuted',
      ),
    ]
    return this.plan('execute', steps)
  }

  async prepareDock(
    request: DockPositionRequest,
    options?: RequestOptions,
  ): Promise<TransactionPlan> {
    await this.wait(options)
    const position = this.findPosition(request.positionId)
    if (!compareAddress(position.maker, request.maker)) {
      throw new FrontendGatewayError(
        'INVALID_ARGUMENT',
        'Only the maker can dock this position.',
      )
    }
    return this.plan('dock', [
      this.step(
        0,
        'dock-position',
        'Cancel and release position',
        'Dock both allocated assets from the immutable Aqua strategy.',
        request.maker,
        MOCK_ADDRESSES.aqua,
        '0xd0c00001',
        'Docked',
      ),
    ])
  }

  async prepareReplace(
    request: ReplacePositionRequest,
    options?: RequestOptions,
  ): Promise<TransactionPlan> {
    const dock = await this.prepareDock({
      maker: request.maker,
      positionId: request.positionId,
    }, options)
    const publish = await this.preparePublish({
      maker: request.maker,
      draft: request.replacement,
    }, options)
    const steps = [...dock.steps, ...publish.steps].map((step, order) => ({
      ...step,
      id: `replace-step-${order + 1}`,
      order,
    }))
    return this.plan('replace', steps)
  }

  private async wait(options?: RequestOptions): Promise<void> {
    if (options?.signal?.aborted === true) {
      throw new FrontendGatewayError('ABORTED', 'Request was aborted.', {
        retryable: true,
      })
    }
    if (this.latencyMs === 0) return

    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        clearTimeout(timeout)
        reject(new FrontendGatewayError('ABORTED', 'Request was aborted.', {
          retryable: true,
        }))
      }
      const finish = () => {
        options?.signal?.removeEventListener('abort', abort)
        resolve()
      }
      const timeout = setTimeout(finish, this.latencyMs)
      options?.signal?.addEventListener('abort', abort, { once: true })
    })
  }

  private meta(source: DataMeta['source'] = 'mock'): DataMeta {
    return mockMeta(this.now().toISOString(), source)
  }

  private assertMarket(marketId: Bytes32): void {
    if (marketId !== MARKET_ID) {
      throw new FrontendGatewayError('NOT_FOUND', 'Market was not found.')
    }
  }

  private findPosition(positionId: Bytes32): PositionDetail {
    const position = POSITIONS.find((candidate) => candidate.id === positionId)
    if (position === undefined) {
      throw new FrontendGatewayError('NOT_FOUND', 'Position was not found.')
    }
    return position
  }

  private assertSlippage(slippageBps: number): void {
    if (!Number.isInteger(slippageBps) || slippageBps < 0
      || slippageBps > MAX_SLIPPAGE_BPS) {
      throw new FrontendGatewayError(
        'INVALID_ARGUMENT',
        `Slippage must be an integer between 0 and ${MAX_SLIPPAGE_BPS} bps.`,
      )
    }
  }

  private quoteFill(
    position: PositionDetail,
    side: CurveSide,
    kind: QuoteKind,
    fixedRaw: bigint,
    index: number,
  ): RouteFillView {
    const tokenIn = side === 'sell' ? QUOTE_TOKEN : BASE_TOKEN
    const tokenOut = side === 'sell' ? BASE_TOKEN : QUOTE_TOKEN
    const priceBeforeWad = fixturePriceWad(position, side)
    let amountInRaw: bigint
    let amountOutRaw: bigint

    if (kind === 'exact-input') {
      amountInRaw = fixedRaw
      const inputWad = rawToWad(raw(amountInRaw), tokenIn.decimals)
      const outputWad = side === 'sell'
        ? mulDivDown(inputWad, WAD, priceBeforeWad)
        : mulDivDown(inputWad, priceBeforeWad, WAD)
      amountOutRaw = BigInt(wadToRawDown(outputWad, tokenOut.decimals))
    } else {
      amountOutRaw = fixedRaw
      const outputWad = rawToWad(raw(amountOutRaw), tokenOut.decimals)
      const inputWad = side === 'sell'
        ? mulDivUp(outputWad, priceBeforeWad, WAD)
        : mulDivUp(outputWad, WAD, priceBeforeWad)
      amountInRaw = BigInt(wadToRawUp(inputWad, tokenIn.decimals))
    }

    const movementBps = BigInt(18 + (index * 7))
    const priceAfterWad = side === 'sell'
      ? mulDivUp(priceBeforeWad, 10_000n + movementBps, 10_000n)
      : mulDivDown(priceBeforeWad, 10_000n - movementBps, 10_000n)
    const effectivePriceWad = (priceBeforeWad + priceAfterWad) / 2n
    const progressBefore = position[side].runtime.progressBps
    const capacityRaw = BigInt(position[side].runtime.availableOutput.raw)
    const consumedBps = capacityRaw === 0n
      ? 0
      : Number((amountOutRaw * 10_000n) / capacityRaw)
    const progressAfter = Math.min(10_000, progressBefore + consumedBps)
    const nativeBefore = fixtureNativeRate(position, side)
    const nativeAfter = side === 'buy'
      ? priceAfterWad.toString() as WadInteger
      : ((10n ** 36n) / priceAfterWad).toString() as WadInteger
    if (amountOutRaw > capacityRaw) {
      throw new FrontendGatewayError(
        'INSUFFICIENT_LIQUIDITY',
        'The mock route exceeds available maker inventory.',
        { details: { positionId: position.id, side } },
      )
    }

    return {
      index,
      positionId: position.id,
      positionKey: position.positionKey,
      maker: position.maker,
      expectedVersion: position.runtimeVersion,
      amountIn: tokenAmount(tokenIn, raw(amountInRaw), 8),
      amountOut: tokenAmount(tokenOut, raw(amountOutRaw), 8),
      displayedPriceBefore: this.price(priceBeforeWad),
      displayedPriceAfter: this.price(priceAfterWad),
      displayedEffectivePrice: this.price(effectivePriceWad),
      nativeRateBefore: {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        wad: nativeBefore,
        formatted: fixturePriceLabel(nativeBefore),
      },
      nativeRateAfter: {
        tokenIn: tokenIn.address,
        tokenOut: tokenOut.address,
        wad: nativeAfter,
        formatted: fixturePriceLabel(nativeAfter),
      },
      activeProgressBeforeBps: progressBefore,
      activeProgressAfterBps: progressAfter,
      oppositeInventoryCredit: tokenAmount(tokenIn, raw(amountInRaw), 8),
    }
  }

  private validateDraft(draft: PositionDraft): ValidationIssue[] {
    const issues: ValidationIssue[] = []
    if (compareAddress(draft.baseToken.address, draft.quoteToken.address)) {
      issues.push({
        path: 'market',
        severity: 'error',
        code: 'IDENTICAL_TOKENS',
        message: 'Base and quote token must be different.',
      })
    }
    if (draft.baseToken.decimals > 18 || draft.quoteToken.decimals > 18) {
      issues.push({
        path: 'market',
        severity: 'error',
        code: 'UNSUPPORTED_TOKEN_DECIMALS',
        message: 'The MVP supports token decimals up to 18.',
      })
    }
    this.validateCurveDraft(draft.sell, 'sell', draft.baseToken.decimals, issues)
    this.validateCurveDraft(draft.buy, 'buy', draft.quoteToken.decimals, issues)

    const sellReserve = Number(draft.sell.initialReserve)
    const buyReserve = Number(draft.buy.initialReserve)
    if (sellReserve === 0 && buyReserve === 0) {
      issues.push({
        path: 'market',
        severity: 'error',
        code: 'EMPTY_POSITION',
        message: 'At least one side must start with inventory.',
      })
    }
    const ask = Number(draft.sell.startPrice)
    const bid = Number(draft.buy.startPrice)
    if (Number.isFinite(ask) && Number.isFinite(bid) && bid >= ask) {
      issues.push({
        path: 'market',
        severity: 'warning',
        code: 'CROSSED_POSITION',
        message: 'Initial bid is at or above the ask and may be immediately arbitraged.',
      })
    }
    return issues
  }

  private validateCurveDraft(
    curve: CurveDraft,
    side: CurveSide,
    reserveDecimals: number,
    issues: ValidationIssue[],
  ): void {
    const start = Number(curve.startPrice)
    const end = Number(curve.endPrice)
    const alpha = Number(curve.alpha)
    const reserve = Number(curve.initialReserve)
    for (const [field, value, encoded] of [
      ['startPrice', start, curve.startPrice],
      ['endPrice', end, curve.endPrice],
    ] as const) {
      let validEncoding = true
      try {
        parseWad(encoded)
      } catch {
        validEncoding = false
      }
      if (!validEncoding || !Number.isFinite(value) || value <= 0) {
        issues.push({
          path: `${side}.${field}`,
          severity: 'error',
          code: 'NONPOSITIVE_PRICE',
          message: 'Price must be a positive decimal.',
        })
      }
    }
    let encodedAlpha: bigint | null = null
    try {
      encodedAlpha = BigInt(parseSignedWad(curve.alpha))
    } catch {
      encodedAlpha = null
    }
    if (encodedAlpha === null || !Number.isFinite(alpha)) {
      issues.push({
        path: `${side}.alpha`,
        severity: 'error',
        code: 'INVALID_ALPHA',
        message: 'Alpha must be a signed decimal.',
      })
    } else if (encodedAlpha < -INT128_MAX || encodedAlpha > INT128_MAX) {
      issues.push({
        path: `${side}.alpha`,
        severity: 'error',
        code: 'ALPHA_OUT_OF_RANGE',
        message: 'Alpha exceeds the signed int128 protocol encoding.',
      })
    }
    let validReserveEncoding = true
    try {
      parseUnits(curve.initialReserve, reserveDecimals)
    } catch {
      validReserveEncoding = false
    }
    if (!validReserveEncoding || !Number.isFinite(reserve) || reserve < 0) {
      issues.push({
        path: `${side}.initialReserve`,
        severity: 'error',
        code: 'INVALID_RESERVE',
        message: 'Initial reserve must be a non-negative decimal.',
      })
    }
    if (Number.isFinite(start) && Number.isFinite(end)) {
      const wrongOrder = side === 'sell' ? start > end : start < end
      if (wrongOrder) {
        issues.push({
          path: `${side}.endPrice`,
          severity: 'error',
          code: 'WRONG_ENDPOINT_ORDER',
          message: side === 'sell'
            ? 'Sell price must stay flat or increase as inventory is consumed.'
            : 'Buy price must stay flat or decrease as inventory is consumed.',
        })
      }
      if (start === end && alpha !== 0) {
        issues.push({
          path: `${side}.alpha`,
          severity: 'warning',
          code: 'FLAT_ALPHA_CANONICALIZED',
          message: 'Alpha has no economic effect on a flat order and will become zero.',
        })
      } else if (
        encodedAlpha !== null
        && Number.isFinite(alpha)
        && start > 0
        && end > 0
        && Math.abs(alpha * Math.log(end / start)) > MAX_POWER_MAGNITUDE
      ) {
        issues.push({
          path: `${side}.alpha`,
          severity: 'error',
          code: 'ALPHA_PRICE_DOMAIN',
          message: 'This alpha and price range exceed the onchain exponential domain; narrow the range or reduce |alpha|.',
        })
      }
    }
  }

  private previewCurve(
    draft: PositionDraft,
    side: CurveSide,
    issues: ValidationIssue[],
  ): CurveDraftPreview | null {
    if (issues.some((issue) => issue.severity === 'error'
      && (issue.path === 'market' || issue.path.startsWith(`${side}.`)))) {
      return null
    }
    const curve = draft[side]
    const reserveToken = side === 'sell' ? draft.baseToken : draft.quoteToken
    const canonicalAlpha = Number(curve.startPrice) === Number(curve.endPrice)
      ? '0'
      : curve.alpha
    return {
      side,
      branch: inferBranch(side, curve.startPrice, curve.endPrice, canonicalAlpha),
      canonicalAlpha,
      startPrice: displayedPrice(
        draft.baseToken.address,
        draft.quoteToken.address,
        curve.startPrice,
      ),
      endPrice: displayedPrice(
        draft.baseToken.address,
        draft.quoteToken.address,
        curve.endPrice,
      ),
      initialReserve: tokenAmount(
        reserveToken,
        parseUnits(curve.initialReserve, reserveToken.decimals),
        8,
      ),
      marginalSamples: marginalSamples({
        baseToken: draft.baseToken.address,
        quoteToken: draft.quoteToken.address,
        startPrice: curve.startPrice,
        endPrice: curve.endPrice,
        alpha: canonicalAlpha,
        initialReserve: curve.initialReserve,
      }),
    }
  }

  private price(wad: bigint): DisplayPrice {
    return {
      baseToken: BASE_TOKEN.address,
      quoteToken: QUOTE_TOKEN.address,
      wad: wad.toString() as WadInteger,
      formatted: formatWad(wad.toString() as WadInteger, 8),
    }
  }

  private step(
    order: number,
    action: TransactionStep['action'],
    title: string,
    description: string,
    from: Address,
    to: Address,
    data: Hex,
    expectedEvent: string,
  ): TransactionStep {
    const transaction: PreparedTransaction = {
      chainId: MOCK_CHAIN_ID,
      from,
      to,
      data,
      value: '0',
    }
    return {
      id: `mock-step-${order + 1}`,
      order,
      action,
      title,
      description,
      transaction,
      expectedEvent,
    }
  }

  private plan(
    action: TransactionPlan['action'],
    steps: TransactionStep[],
  ): TransactionPlan {
    this.planSequence += 1
    return {
      id: `mock-plan-${this.planSequence}`,
      mode: 'mock',
      action,
      sendable: false,
      steps,
      warnings: [
        'Mock calldata is a UI fixture and must never be submitted to a wallet.',
        'Switch to the future live adapter only after deployment manifests and ABI generation.',
      ],
      meta: this.meta(),
    }
  }
}

export function createMockLiquidOBClient(
  options: MockLiquidOBClientOptions = {},
): MockLiquidOBClient {
  return new MockLiquidOBClient(options)
}
