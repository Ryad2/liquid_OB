import {
  erc20Abi,
  parseDeploymentManifest,
  type DeploymentManifest,
} from '@liquid-ob/contracts'
import {
  WAD,
  compilePosition,
  encodePositionPayload,
  marginalPriceWad,
  type CompiledCurve,
  type PositionConfig,
} from '@liquid-ob/curve-math'
import {
  FrontendGatewayError,
  formatUnits,
  formatWad,
  mulDivDown,
  parseSignedWad,
  parseUnits,
  parseWad,
  rawToWad,
  tokenAmount,
  type ActivityItem,
  type ActivityQuery,
  type Address,
  type Bytes32,
  type CurveDraftPreview,
  type CurveSample,
  type CurveSide,
  type DataMeta,
  type DisplayPrice,
  type DockPositionRequest,
  type ExecuteRouteRequest,
  type FrontendBootstrap,
  type LiquidOBFrontendClient,
  type MarketDetail,
  type MarketQuery,
  type MarketSummary,
  type Page,
  type PositionDetail,
  type PositionDraft,
  type PositionPreview,
  type PositionQuery,
  type PositionSummary,
  type PreparedTransaction,
  type PublishPositionRequest,
  type QuoteRequest,
  type RawAmount,
  type ReplacePositionRequest,
  type RequestOptions,
  type RouteFillView,
  type RouteQuote,
  type TransactionAction,
  type TransactionPlan,
  type TransactionStep,
  type ValidationIssue,
  type WadInteger,
} from '@liquid-ob/frontend-api'
import { buildDockPositionCall, preparePublishPosition } from '@liquid-ob/position-sdk'
import {
  bytesToHex,
  createPublicClient,
  encodeFunctionData,
  http,
  isAddress,
  keccak256,
  type Hex,
  type PublicClient,
} from 'viem'
import { ZodError, type ZodType } from 'zod'

import {
  activitySchema,
  bootstrapSchema,
  errorEnvelopeSchema,
  marketDetailSchema,
  marketSchema,
  pageSchema,
  positionDetailSchema,
  positionSchema,
  preparedRouteSchema,
  type PreparedRoutePayload,
} from './schemas.js'

const QUOTE_ACCOUNT = '0x0000000000000000000000000000000000000001' as Address
const INT128_MIN = -(1n << 127n)
const INT128_MAX = (1n << 127n) - 1n

export interface LiveLiquidOBClientOptions {
  apiUrl: string
  manifestUrl: string
  rpcUrl?: string
  fetch?: typeof globalThis.fetch
  publicClient?: PublicClient
  timeoutMs?: number
  now?: () => Date
}

interface CompiledDraft {
  config: PositionConfig
  baseAllocation: bigint
  quoteAllocation: bigint
}

export function createLiveLiquidOBClient(options: LiveLiquidOBClientOptions): LiquidOBFrontendClient {
  return new LiveLiquidOBClient(options)
}

export class LiveLiquidOBClient implements LiquidOBFrontendClient {
  readonly mode = 'live' as const
  readonly #apiUrl: string
  readonly #manifestUrl: string
  readonly #rpcUrl: string | undefined
  readonly #fetch: typeof globalThis.fetch
  readonly #providedPublicClient: PublicClient | undefined
  readonly #timeoutMs: number
  readonly #now: () => Date
  readonly #draftSalts = new Map<string, Bytes32>()
  #manifestPromise: Promise<DeploymentManifest> | undefined
  #bootstrapPromise: Promise<FrontendBootstrap> | undefined

  constructor(options: LiveLiquidOBClientOptions) {
    this.#apiUrl = endpoint(options.apiUrl, 'solver API')
    this.#manifestUrl = endpoint(options.manifestUrl, 'deployment manifest')
    this.#rpcUrl = options.rpcUrl === undefined ? undefined : endpoint(options.rpcUrl, 'RPC')
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis)
    this.#providedPublicClient = options.publicClient
    this.#timeoutMs = Math.max(1_000, options.timeoutMs ?? 12_000)
    this.#now = options.now ?? (() => new Date())
  }

  async getBootstrap(options?: RequestOptions): Promise<FrontendBootstrap> {
    if (options?.signal !== undefined) return this.#loadBootstrap(options.signal)
    this.#bootstrapPromise ??= this.#loadBootstrap()
    return this.#bootstrapPromise
  }

  async listMarkets(query: MarketQuery = {}, options?: RequestOptions): Promise<Page<MarketSummary>> {
    return this.#get('/v1/markets', pageSchema(marketSchema), query, options?.signal) as Promise<Page<MarketSummary>>
  }

  async getMarket(marketId: Bytes32, options?: RequestOptions): Promise<MarketDetail> {
    return this.#get(`/v1/markets/${marketId}`, marketDetailSchema, {}, options?.signal) as Promise<MarketDetail>
  }

  async listPositions(query: PositionQuery = {}, options?: RequestOptions): Promise<Page<PositionSummary>> {
    return this.#get('/v1/positions', pageSchema(positionSchema), query, options?.signal) as Promise<Page<PositionSummary>>
  }

  async getPosition(positionId: Bytes32, options?: RequestOptions): Promise<PositionDetail> {
    return this.#get(`/v1/positions/${positionId}`, positionDetailSchema, {}, options?.signal) as Promise<PositionDetail>
  }

  async previewPosition(draft: PositionDraft, options?: RequestOptions): Promise<PositionPreview> {
    abortIfNeeded(options?.signal)
    const issues = validateDraft(draft)
    let compiled: CompiledDraft | null = null
    if (!issues.some((issue) => issue.severity === 'error')) {
      try {
        compiled = compileDraft(draft, this.#salt(draft))
      } catch (error) {
        issues.push({
          path: 'market',
          severity: 'error',
          code: 'UNSUPPORTED_CURVE_DOMAIN',
          message: message(error),
        })
      }
    }
    const meta = localMeta(this.#now())
    if (compiled === null) {
      return { draft, sell: null, buy: null, initialSpreadBps: null, canPublish: false, issues, policyHash: null, payload: null, meta }
    }
    const payload = encodePositionPayload(compiled.config)
    return {
      draft,
      sell: curvePreview(compiled.config.sell, 'sell', draft, compiled.baseAllocation),
      buy: curvePreview(compiled.config.buy, 'buy', draft, compiled.quoteAllocation),
      initialSpreadBps: spread(compiled.config.buy.startPriceWad, compiled.config.sell.startPriceWad),
      canPublish: true,
      issues,
      policyHash: keccak256(payload),
      payload,
      meta,
    }
  }

  async quote(request: QuoteRequest, options?: RequestOptions): Promise<RouteQuote> {
    const market = await this.getMarket(request.marketId, options)
    const [tokenIn, tokenOut] = routeTokens(market, request.side)
    const fixedToken = request.kind === 'exact-input' ? tokenIn : tokenOut
    if (!sameAddress(request.amount.token, fixedToken.address)) {
      throw new FrontendGatewayError('INVALID_ARGUMENT', `${request.kind} amount must use ${fixedToken.symbol}.`)
    }
    if (BigInt(request.amount.raw) <= 0n) throw new FrontendGatewayError('INVALID_AMOUNT', 'Quote amount must be positive.')
    const account = request.recipient ?? QUOTE_ACCOUNT
    const route = await this.#post('/v1/quote', preparedRouteSchema, {
      marketId: request.marketId,
      side: request.side,
      kind: request.kind,
      amount: request.amount.raw,
      slippageBps: request.slippageBps,
      payer: account,
      recipient: account,
      refundRecipient: account,
      deadlineSeconds: request.deadlineSeconds ?? 600,
    }, options?.signal)
    return mapRoute(route, market, request.slippageBps, this.#now())
  }

  async listActivity(query: ActivityQuery = {}, options?: RequestOptions): Promise<Page<ActivityItem>> {
    return this.#get('/v1/activity', pageSchema(activitySchema), query, options?.signal) as Promise<Page<ActivityItem>>
  }

  async preparePublish(request: PublishPositionRequest, options?: RequestOptions): Promise<TransactionPlan> {
    const { bootstrap, manifest } = await this.#writable(options?.signal)
    const compiled = compileDraft(request.draft, this.#salt(request.draft))
    const prepared = await preparePublishPosition(await this.#publicClient(manifest), manifest, {
      maker: request.maker,
      config: compiled.config,
      baseAllocation: compiled.baseAllocation,
      quoteAllocation: compiled.quoteAllocation,
    })
    const steps = prepared.calls.map((call, index): TransactionStep => {
      const publish = index === prepared.calls.length - 1
      return step(
        `publish-${index + 1}-${prepared.strategy.strategyHash.slice(2, 10)}`,
        index,
        publish ? 'publish-position' : 'approve-aqua',
        call.label,
        publish ? 'Publish the immutable two-sided strategy through Aqua.' : 'Authorize Aqua settlement for current and future position inventory.',
        request.maker,
        call.to,
        call.data,
        publish ? 'Shipped' : 'Approval',
        manifest.network.chainId,
      )
    })
    return plan('publish', steps, bootstrap.meta, this.#now())
  }

  async prepareExecute(request: ExecuteRouteRequest, options?: RequestOptions): Promise<TransactionPlan> {
    const { bootstrap, manifest } = await this.#writable(options?.signal)
    if (request.quote.meta.stale || new Date(request.quote.expiresAt).getTime() <= this.#now().getTime()) {
      throw new FrontendGatewayError('STALE_QUOTE', 'The route quote has expired or is stale.', { retryable: true })
    }
    const remainingSeconds = Math.floor((new Date(request.quote.expiresAt).getTime() - this.#now().getTime()) / 1_000)
    const fixed = request.quote.kind === 'exact-input' ? request.quote.amountIn : request.quote.amountOut
    const route = await this.#post('/v1/quote', preparedRouteSchema, {
      marketId: request.quote.marketId,
      side: request.quote.side,
      kind: request.quote.kind,
      amount: fixed.raw,
      slippageBps: request.quote.slippageBps,
      payer: request.payer,
      recipient: request.recipient,
      refundRecipient: request.refundRecipient,
      deadlineSeconds: Math.max(30, Math.min(3_600, remainingSeconds)),
    }, options?.signal)
    assertSameQuote(request.quote, route)
    const approvalRaw = route.kind === 'exact-input' ? route.amountInRaw : route.limitRaw
    const approveData = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [manifest.contracts.batchExecutor.address, BigInt(approvalRaw)],
    })
    const steps = [
      step(
        `execute-approve-${route.routeId.slice(2, 10)}`,
        0,
        'approve-executor',
        `Approve ${request.quote.amountIn.token.symbol}`,
        `Authorize at most ${formatUnits(approvalRaw as RawAmount, request.quote.amountIn.token.decimals, 8)} ${request.quote.amountIn.token.symbol}.`,
        request.payer,
        request.quote.amountIn.token.address,
        approveData,
        'Approval',
        manifest.network.chainId,
      ),
      step(
        `execute-route-${route.routeId.slice(2, 10)}`,
        1,
        'execute-route',
        'Execute atomic route',
        `Settle ${route.fills.length} maker fills atomically after the approval confirms.`,
        request.payer,
        route.transaction.to as Address,
        route.transaction.data as Hex,
        'RouteExecuted',
        manifest.network.chainId,
      ),
    ]
    return plan('execute', steps, bootstrap.meta, this.#now())
  }

  async prepareDock(request: DockPositionRequest, options?: RequestOptions): Promise<TransactionPlan> {
    const [{ bootstrap, manifest }, position] = await Promise.all([
      this.#writable(options?.signal),
      this.getPosition(request.positionId, options),
    ])
    if (!sameAddress(position.maker, request.maker)) {
      throw new FrontendGatewayError('INVALID_ARGUMENT', 'Only the maker can dock this position.')
    }
    if (position.strategy === null) throw new FrontendGatewayError('FEATURE_UNAVAILABLE', 'Strategy bytes are unavailable.')
    const call = buildDockPositionCall(manifest, {
      maker: position.maker,
      strategyHash: position.strategyHash,
      strategy: position.strategy,
    }, position.sell.runtime.availableOutput.token.address, position.buy.runtime.availableOutput.token.address)
    return plan('dock', [step(
      `dock-${position.id.slice(2, 10)}`,
      0,
      'dock-position',
      call.label,
      'Cancel both sides and release their Aqua allocations.',
      request.maker,
      call.to,
      call.data,
      'Docked',
      manifest.network.chainId,
    )], bootstrap.meta, this.#now())
  }

  async prepareReplace(request: ReplacePositionRequest, options?: RequestOptions): Promise<TransactionPlan> {
    const [dock, publish] = await Promise.all([
      this.prepareDock({ maker: request.maker, positionId: request.positionId }, options),
      this.preparePublish({ maker: request.maker, draft: request.replacement }, options),
    ])
    const steps = [...dock.steps, ...publish.steps].map((entry, order) => ({
      ...entry,
      id: `replace-${order + 1}-${entry.id}`,
      order,
    }))
    return { ...plan('replace', steps, publish.meta, this.#now()), warnings: ['Replacement is non-atomic across wallet transactions.'] }
  }

  async #loadBootstrap(signal?: AbortSignal): Promise<FrontendBootstrap> {
    const [bootstrap, manifest] = await Promise.all([
      this.#get('/v1/bootstrap', bootstrapSchema, {}, signal) as Promise<FrontendBootstrap>,
      this.#manifest(signal),
    ])
    assertManifestMatchesBootstrap(manifest, bootstrap)
    return bootstrap
  }

  async #manifest(signal?: AbortSignal): Promise<DeploymentManifest> {
    if (signal !== undefined) return this.#fetchManifest(signal)
    this.#manifestPromise ??= this.#fetchManifest()
    return this.#manifestPromise
  }

  async #fetchManifest(signal?: AbortSignal): Promise<DeploymentManifest> {
    const value = await this.#request(this.#manifestUrl, {
      method: 'GET',
      ...(signal === undefined ? {} : { signal }),
    })
    try {
      return parseDeploymentManifest(value)
    } catch (error) {
      throw unavailable(`Invalid deployment manifest: ${message(error)}`)
    }
  }

  async #writable(signal?: AbortSignal): Promise<{ bootstrap: FrontendBootstrap; manifest: DeploymentManifest }> {
    const bootstrapOptions = signal === undefined ? {} : { signal }
    const [bootstrap, manifest] = await Promise.all([this.getBootstrap(bootstrapOptions), this.#manifest(signal)])
    if (!manifest.release.public || !bootstrap.features.liveWrites || bootstrap.meta.stale) {
      throw new FrontendGatewayError('FEATURE_UNAVAILABLE', 'Live writes are disabled until the public deployment and services are healthy.')
    }
    return { bootstrap, manifest }
  }

  async #publicClient(manifest: DeploymentManifest): Promise<PublicClient> {
    if (this.#providedPublicClient !== undefined) return this.#providedPublicClient
    const rpc = this.#rpcUrl ?? manifest.network.publicRpcUrl
    if (rpc === null || rpc === undefined) throw new FrontendGatewayError('FEATURE_UNAVAILABLE', 'No public RPC is configured.')
    return createPublicClient({ transport: http(rpc) })
  }

  #salt(draft: PositionDraft): Bytes32 {
    if (draft.salt !== undefined) return draft.salt
    const key = JSON.stringify({
      baseToken: draft.baseToken.address.toLowerCase(),
      quoteToken: draft.quoteToken.address.toLowerCase(),
      sell: draft.sell,
      buy: draft.buy,
    })
    const existing = this.#draftSalts.get(key)
    if (existing !== undefined) return existing
    const bytes = new Uint8Array(32)
    globalThis.crypto.getRandomValues(bytes)
    const salt = bytesToHex(bytes) as Bytes32
    this.#draftSalts.set(key, salt)
    return salt
  }

  async #get<T>(path: string, schema: ZodType<T>, query: object, signal?: AbortSignal): Promise<T> {
    const url = new URL(`${this.#apiUrl}${path}`)
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value))
    return this.#parse(await this.#request(url.toString(), {
      method: 'GET',
      ...(signal === undefined ? {} : { signal }),
    }), schema)
  }

  async #post<T>(path: string, schema: ZodType<T>, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.#parse(await this.#request(`${this.#apiUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      ...(signal === undefined ? {} : { signal }),
    }), schema)
  }

  #parse<T>(value: unknown, schema: ZodType<T>): T {
    try {
      return schema.parse(value)
    } catch (error) {
      throw unavailable(`Service response validation failed: ${message(error)}`)
    }
  }

  async #request(url: string, init: RequestInit): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.#timeoutMs)
    const signal = init.signal === null || init.signal === undefined ? timeout : AbortSignal.any([init.signal, timeout])
    let response: Response
    try {
      response = await this.#fetch(url, { ...init, signal, headers: { accept: 'application/json', ...init.headers } })
    } catch (error) {
      if (signal.aborted) throw new FrontendGatewayError('ABORTED', 'Request was aborted or timed out.', { retryable: true })
      throw unavailable(`Service request failed: ${message(error)}`)
    }
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw unavailable(`Service returned non-JSON HTTP ${response.status}.`)
    }
    if (!response.ok) {
      const parsed = errorEnvelopeSchema.safeParse(value)
      if (parsed.success) throw mapApiError(parsed.data.error.code, parsed.data.error.message, parsed.data.error.details)
      throw unavailable(`Service returned HTTP ${response.status}.`)
    }
    return value
  }
}

function compileDraft(draft: PositionDraft, salt: Bytes32): CompiledDraft {
  const config = compilePosition({
    baseToken: draft.baseToken.address,
    quoteToken: draft.quoteToken.address,
    salt,
    sell: {
      startPriceWad: BigInt(parseWad(draft.sell.startPrice)),
      endPriceWad: BigInt(parseWad(draft.sell.endPrice)),
      alphaWad: BigInt(parseSignedWad(draft.sell.alpha)),
      initialReserveWad: BigInt(parseWad(draft.sell.initialReserve)),
    },
    buy: {
      startPriceWad: BigInt(parseWad(draft.buy.startPrice)),
      endPriceWad: BigInt(parseWad(draft.buy.endPrice)),
      alphaWad: BigInt(parseSignedWad(draft.buy.alpha)),
      initialReserveWad: BigInt(parseWad(draft.buy.initialReserve)),
    },
  })
  return {
    config,
    baseAllocation: BigInt(parseUnits(draft.sell.initialReserve, draft.baseToken.decimals)),
    quoteAllocation: BigInt(parseUnits(draft.buy.initialReserve, draft.quoteToken.decimals)),
  }
}

function validateDraft(draft: PositionDraft): ValidationIssue[] {
  const issues: ValidationIssue[] = []
  if (!isAddress(draft.baseToken.address) || !isAddress(draft.quoteToken.address)
    || sameAddress(draft.baseToken.address, draft.quoteToken.address)) {
    issues.push({ path: 'market', severity: 'error', code: 'INVALID_MARKET', message: 'Base and quote must be distinct ERC-20 addresses.' })
  }
  if (draft.baseToken.decimals > 18 || draft.quoteToken.decimals > 18) {
    issues.push({ path: 'market', severity: 'error', code: 'UNSUPPORTED_DECIMALS', message: 'ArcBook supports token decimals up to 18.' })
  }
  validateCurve(draft, 'sell', issues)
  validateCurve(draft, 'buy', issues)
  try {
    if (BigInt(parseWad(draft.sell.initialReserve)) === 0n && BigInt(parseWad(draft.buy.initialReserve)) === 0n) {
      issues.push({ path: 'market', severity: 'error', code: 'EMPTY_POSITION', message: 'At least one curve side must contain inventory.' })
    }
  } catch {
    // Individual reserve fields already carry the actionable validation error.
  }
  try {
    if (BigInt(parseWad(draft.buy.startPrice)) >= BigInt(parseWad(draft.sell.startPrice))) {
      issues.push({ path: 'market', severity: 'warning', code: 'CROSSED_POSITION', message: 'The initial bid crosses the ask and may be arbitraged immediately.' })
    }
  } catch {
    // Individual price fields already carry the actionable validation error.
  }
  return issues
}

function validateCurve(draft: PositionDraft, side: CurveSide, issues: ValidationIssue[]): void {
  const value = draft[side]
  let start: bigint | null = null
  let end: bigint | null = null
  for (const field of ['startPrice', 'endPrice'] as const) {
    try {
      const parsed = BigInt(parseWad(value[field]))
      if (parsed <= 0n) throw new Error('zero')
      if (field === 'startPrice') start = parsed
      else end = parsed
    } catch {
      issues.push({ path: `${side}.${field}`, severity: 'error', code: 'INVALID_PRICE', message: 'Price must be a positive decimal with at most 18 decimals.' })
    }
  }
  try {
    const alpha = BigInt(parseSignedWad(value.alpha))
    if (alpha <= INT128_MIN || alpha > INT128_MAX) throw new Error('range')
  } catch {
    issues.push({ path: `${side}.alpha`, severity: 'error', code: 'INVALID_ALPHA', message: 'Alpha must fit the signed int128 WAD domain.' })
  }
  try {
    parseUnits(value.initialReserve, side === 'sell' ? draft.baseToken.decimals : draft.quoteToken.decimals)
    parseWad(value.initialReserve)
  } catch {
    issues.push({ path: `${side}.initialReserve`, severity: 'error', code: 'INVALID_RESERVE', message: 'Reserve must be a non-negative token amount representable as WAD.' })
  }
  if (start !== null && end !== null && (side === 'sell' ? start > end : start < end)) {
    issues.push({
      path: `${side}.endPrice`,
      severity: 'error',
      code: 'WRONG_ENDPOINT_ORDER',
      message: side === 'sell' ? 'Sell price must stay flat or increase.' : 'Buy price must stay flat or decrease.',
    })
  }
}

function curvePreview(
  curve: CompiledCurve,
  side: CurveSide,
  draft: PositionDraft,
  allocation: bigint,
): CurveDraftPreview {
  const base = draft.baseToken
  const quote = draft.quoteToken
  const outgoing = side === 'sell' ? base : quote
  return {
    side,
    branch: curve.branch,
    canonicalAlpha: signedWad(curve.alphaWad),
    startPrice: price(base.address, quote.address, curve.startPriceWad),
    endPrice: price(base.address, quote.address, curve.endPriceWad),
    initialReserve: tokenAmount(outgoing, allocation.toString() as RawAmount, 8),
    marginalSamples: curveSamples(curve, side, base.address, quote.address),
  }
}

function curveSamples(curve: CompiledCurve, side: CurveSide, base: Address, quote: Address): CurveSample[] {
  return Array.from({ length: 21 }, (_value, index) => {
    const progressBps = index * 500
    const yWad = WAD * BigInt(10_000 - progressBps) / 10_000n
    return {
      progressBps,
      displayedMarginalPrice: price(base, quote, marginalPriceWad(curve, side, { yWad, yIntWad: WAD })),
      remainingReserve: formatWad(yWad.toString() as WadInteger, 6),
    }
  })
}

function mapRoute(route: PreparedRoutePayload, market: MarketDetail, slippageBps: number, now: Date): RouteQuote {
  const [tokenIn, tokenOut] = routeTokens(market, route.side)
  const inputWad = rawToWad(route.amountInRaw as RawAmount, tokenIn.decimals)
  const outputWad = rawToWad(route.amountOutRaw as RawAmount, tokenOut.decimals)
  const baseWad = route.side === 'sell' ? outputWad : inputWad
  const quoteWad = route.side === 'sell' ? inputWad : outputWad
  const effective = mulDivDown(quoteWad, WAD, baseWad)
  const marginalValues = route.fills.map((fill) => BigInt(fill.displayedPriceAfterWad))
  const worst = route.side === 'sell'
    ? marginalValues.reduce((current, value) => value > current ? value : current)
    : marginalValues.reduce((current, value) => value < current ? value : current)
  const before = BigInt(route.fills[0]!.displayedPriceBeforeWad)
  const impact = route.side === 'sell' ? effective - before : before - effective
  const meta: DataMeta = {
    mode: 'live',
    source: 'solver',
    generatedAt: now.toISOString(),
    chainHeadBlock: safeNumber(route.chainHeadBlock, 'chain head'),
    indexedBlock: safeNumber(route.indexedBlock, 'indexed block'),
    indexLag: safeNumber(route.indexLag, 'index lag'),
    stale: false,
    warnings: [],
  }
  return {
    id: route.routeId,
    marketId: route.marketId as Bytes32,
    side: route.side,
    kind: route.kind,
    amountIn: tokenAmount(tokenIn, route.amountInRaw as RawAmount, 8),
    amountOut: tokenAmount(tokenOut, route.amountOutRaw as RawAmount, 8),
    limit: tokenAmount(route.kind === 'exact-input' ? tokenOut : tokenIn, route.limitRaw as RawAmount, 8),
    slippageBps,
    displayedEffectivePrice: price(market.baseToken.address, market.quoteToken.address, effective),
    worstMarginalPrice: price(market.baseToken.address, market.quoteToken.address, worst),
    priceImpactBps: Number(impact > 0n && before > 0n ? impact * 10_000n / before : 0n),
    fills: route.fills.map((fill): RouteFillView => ({
      index: fill.index,
      positionId: fill.positionId as Bytes32,
      positionKey: fill.positionKey as Bytes32,
      maker: fill.maker as Address,
      expectedVersion: safeNumber(fill.expectedVersion, 'runtime version'),
      amountIn: tokenAmount(tokenIn, fill.amountInRaw as RawAmount, 8),
      amountOut: tokenAmount(tokenOut, fill.amountOutRaw as RawAmount, 8),
      displayedPriceBefore: price(market.baseToken.address, market.quoteToken.address, BigInt(fill.displayedPriceBeforeWad)),
      displayedPriceAfter: price(market.baseToken.address, market.quoteToken.address, BigInt(fill.displayedPriceAfterWad)),
      displayedEffectivePrice: price(market.baseToken.address, market.quoteToken.address, BigInt(fill.displayedEffectivePriceWad)),
      nativeRateBefore: { tokenIn: tokenIn.address, tokenOut: tokenOut.address, wad: fill.nativeRateBeforeWad as WadInteger, formatted: formatWad(fill.nativeRateBeforeWad as WadInteger, 8) },
      nativeRateAfter: { tokenIn: tokenIn.address, tokenOut: tokenOut.address, wad: fill.nativeRateAfterWad as WadInteger, formatted: formatWad(fill.nativeRateAfterWad as WadInteger, 8) },
      activeProgressBeforeBps: progress(BigInt(fill.activeYBeforeWad), BigInt(fill.activeYIntWad)),
      activeProgressAfterBps: progress(BigInt(fill.activeYAfterWad), BigInt(fill.activeYIntWad)),
      oppositeInventoryCredit: tokenAmount(tokenIn, fill.amountInRaw as RawAmount, 8),
    })),
    simulation: {
      status: route.simulation.status === 'success' ? 'success' : 'not-run',
      blockNumber: route.simulation.blockNumber === null ? null : safeNumber(route.simulation.blockNumber, 'simulation block'),
      gasEstimate: route.simulation.gasEstimate as RawAmount | null,
      revertCode: null,
      message: route.simulation.status === 'success'
        ? 'Final route simulation succeeded.'
        : 'The wallet estimates execution after the approval confirms.',
    },
    createdAt: now.toISOString(),
    expiresAt: new Date(route.deadline * 1_000).toISOString(),
    meta,
  }
}

function routeTokens(market: MarketDetail, side: CurveSide) {
  return side === 'sell'
    ? [market.quoteToken, market.baseToken] as const
    : [market.baseToken, market.quoteToken] as const
}

function assertSameQuote(quote: RouteQuote, route: PreparedRoutePayload): void {
  if (route.marketId.toLowerCase() !== quote.marketId.toLowerCase() || route.side !== quote.side || route.kind !== quote.kind) {
    throw unavailable('Final route does not match the reviewed quote.')
  }
  const fixed = route.kind === 'exact-input' ? route.amountInRaw : route.amountOutRaw
  const expected = route.kind === 'exact-input' ? quote.amountIn.raw : quote.amountOut.raw
  if (fixed !== expected) throw unavailable('Final route changed the caller-fixed amount.')
}

function assertManifestMatchesBootstrap(manifest: DeploymentManifest, bootstrap: FrontendBootstrap): void {
  const expected = {
    aqua: manifest.contracts.aqua.address,
    liquidOBRouter: manifest.contracts.router.address,
    quoter: manifest.contracts.quoter.address,
    lens: manifest.contracts.lens.address,
    batchExecutor: manifest.contracts.batchExecutor.address,
    curveKernel: manifest.contracts.curveKernel.address,
  }
  if (manifest.network.chainId !== bootstrap.network.chainId) throw new FrontendGatewayError('UNSUPPORTED_NETWORK', 'Manifest and API chain IDs differ.')
  for (const [key, value] of Object.entries(expected)) {
    const actual = bootstrap.addresses[key as keyof typeof expected]
    if (actual === null || !sameAddress(actual, value)) throw unavailable(`Manifest and API disagree on ${key}.`)
  }
}

function step(
  id: string,
  order: number,
  action: TransactionAction,
  title: string,
  description: string,
  from: Address,
  to: Address,
  data: Hex,
  expectedEvent: string,
  chainId: number,
): TransactionStep {
  const transaction: PreparedTransaction = { chainId, from, to, data, value: '0' }
  return { id, order, action, title, description, transaction, expectedEvent }
}

function plan(action: TransactionPlan['action'], steps: TransactionStep[], meta: DataMeta, now: Date): TransactionPlan {
  return {
    id: `${action}-${now.getTime()}-${steps[0]?.id ?? 'empty'}`,
    mode: 'live',
    action,
    sendable: true,
    steps,
    warnings: [],
    meta: { ...meta, generatedAt: now.toISOString() },
  }
}

function price(baseToken: Address, quoteToken: Address, value: bigint): DisplayPrice {
  return { baseToken, quoteToken, wad: value.toString() as WadInteger, formatted: formatWad(value.toString() as WadInteger, 8) }
}

function signedWad(value: bigint): string {
  const negative = value < 0n
  const formatted = formatUnits((negative ? -value : value).toString() as RawAmount, 18, 8)
  return negative ? `-${formatted}` : formatted
}

function spread(bid: bigint, ask: bigint): number | null {
  return bid === 0n ? null : Number((ask - bid) * 10_000n / bid)
}

function progress(y: bigint, yInt: bigint): number {
  if (yInt <= 0n) return 0
  const value = Number((yInt - y) * 10_000n / yInt)
  return Math.max(0, Math.min(10_000, value))
}

function safeNumber(value: string, label: string): number {
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < 0) throw unavailable(`${label} exceeds the frontend integer range.`)
  return result
}

function localMeta(now: Date): DataMeta {
  return { mode: 'live', source: 'curve-math', generatedAt: now.toISOString(), chainHeadBlock: null, indexedBlock: null, indexLag: null, stale: false, warnings: [] }
}

function endpoint(value: string, label: string): string {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol')
    return url.toString().replace(/\/$/, '')
  } catch {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`)
  }
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted === true) throw new FrontendGatewayError('ABORTED', 'Request was aborted.', { retryable: true })
}

function mapApiError(code: string, apiMessage: string, details?: Record<string, unknown>) {
  const mapped = code === 'INVALID_REQUEST' ? 'INVALID_ARGUMENT'
    : code === 'INSUFFICIENT_LIQUIDITY' ? 'INSUFFICIENT_LIQUIDITY'
      : code === 'SIMULATION_REVERTED' ? 'SIMULATION_REVERTED'
        : code === 'SUBGRAPH_STALE' ? 'SERVICE_UNAVAILABLE'
          : code === 'CHAIN_MISMATCH' ? 'UNSUPPORTED_NETWORK'
            : 'SERVICE_UNAVAILABLE'
  return new FrontendGatewayError(mapped, apiMessage, { retryable: mapped === 'SERVICE_UNAVAILABLE', ...(details === undefined ? {} : { details }) })
}

function unavailable(value: string): FrontendGatewayError {
  return new FrontendGatewayError('SERVICE_UNAVAILABLE', value, { retryable: true })
}

function message(error: unknown): string {
  if (error instanceof ZodError) return error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
  return error instanceof Error ? error.message : 'unknown error'
}
