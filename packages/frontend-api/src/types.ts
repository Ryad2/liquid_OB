/** Framework-neutral product types consumed by every ArcBook frontend. */

export type Address = `0x${string}`
export type Hex = `0x${string}`
export type Bytes32 = `0x${string}`
export type RawAmount = `${bigint}`
export type WadInteger = `${bigint}`
export type SignedWadInteger = `${bigint}`
export type DecimalString = string
export type IsoTimestamp = string

export type FrontendMode = 'mock' | 'live'
export type CurveSide = 'sell' | 'buy'
export type QuoteKind = 'exact-input' | 'exact-output'
export type CurveBranch =
  | 'general'
  | 'native-alpha-zero'
  | 'native-alpha-one'
  | 'flat'
export type PositionLifecycle = 'unknown' | 'active' | 'docked'
export type BackingStatus = 'backed' | 'warning' | 'unavailable'
export type ServiceHealth = 'healthy' | 'degraded' | 'offline' | 'not-configured'

export interface Token {
  address: Address
  chainId: number
  symbol: string
  name: string
  decimals: number
  logoUri?: string
}

/** Raw transfer amount plus a convenience display string. Raw is authoritative. */
export interface TokenAmount {
  token: Token
  raw: RawAmount
  formatted: DecimalString
}

/** Displayed market price, always quote-token units per one base token. */
export interface DisplayPrice {
  baseToken: Address
  quoteToken: Address
  wad: WadInteger
  formatted: DecimalString
}

/** Native curve rate, always outgoing-token units per incoming-token unit. */
export interface NativeRate {
  tokenIn: Address
  tokenOut: Address
  wad: WadInteger
  formatted: DecimalString
}

export type DataSource =
  | 'mock'
  | 'deployment-manifest'
  | 'curve-math'
  | 'subgraph'
  | 'solver'
  | 'rpc'
  | 'composed'

export interface DataMeta {
  mode: FrontendMode
  source: DataSource
  generatedAt: IsoTimestamp
  chainHeadBlock: number | null
  indexedBlock: number | null
  indexLag: number | null
  stale: boolean
  warnings: string[]
}

export interface PageInfo {
  cursor: string | null
  hasNextPage: boolean
  totalCount: number
}

export interface Page<T> {
  items: T[]
  pageInfo: PageInfo
  meta: DataMeta
}

export interface ServiceState {
  name: 'rpc' | 'subgraph' | 'solver'
  health: ServiceHealth
  url: string | null
  message: string
}

export interface DeploymentAddresses {
  aqua: Address | null
  swapVmRouter: Address | null
  curveKernel: Address | null
  liquidOBRouter: Address | null
  quoter: Address | null
  lens: Address | null
  batchExecutor: Address | null
}

export interface FeatureAvailability {
  marketExplorer: boolean
  makerPreview: boolean
  publishPosition: boolean
  positionManagement: boolean
  exactInputQuotes: boolean
  exactOutputQuotes: boolean
  executeRoutes: boolean
  liveWrites: boolean
}

export interface FrontendBootstrap {
  protocolName: 'ArcBook'
  protocolVersion: string
  mode: FrontendMode
  network: {
    chainId: number
    name: string
    explorerUrl: string | null
    nativeCurrencySymbol: string
  }
  deploymentBlock: number | null
  addresses: DeploymentAddresses
  services: ServiceState[]
  features: FeatureAvailability
  tokens: Token[]
  meta: DataMeta
}

export interface CurveSample {
  progressBps: number
  displayedMarginalPrice: DisplayPrice
  remainingReserve: DecimalString
}

export interface CurvePolicyView {
  side: CurveSide
  branch: CurveBranch
  startPrice: DisplayPrice
  endPrice: DisplayPrice
  alpha: DecimalString
  alphaWad: SignedWadInteger
  initialReserve: TokenAmount
}

export interface CurveRuntimeView {
  yWad: WadInteger
  yIntWad: WadInteger
  progressBps: number
  availableOutput: TokenAmount
  currentMarginalPrice: DisplayPrice
  backingStatus: BackingStatus
}

export interface CurveView {
  policy: CurvePolicyView
  runtime: CurveRuntimeView
  marginalSamples: CurveSample[]
}

export interface MarketStats {
  activePositions: number
  activeSellSides: number
  activeBuySides: number
  fillCount24h: number
  volumeQuote24h: TokenAmount
}

export interface MarketSummary {
  id: Bytes32
  baseToken: Token
  quoteToken: Token
  bestBid: DisplayPrice | null
  bestAsk: DisplayPrice | null
  spreadBps: number | null
  stats: MarketStats
  lastUpdateBlock: number
}

export interface MarketDetail extends MarketSummary {
  recentRouteIds: Bytes32[]
  meta: DataMeta
}

export interface PositionSummary {
  id: Bytes32
  positionKey: Bytes32
  strategyHash: Bytes32
  policyHash: Bytes32
  marketId: Bytes32
  maker: Address
  lifecycle: PositionLifecycle
  runtimeVersion: number
  sell: CurveView
  buy: CurveView
  sufficientlyBacked: boolean
  lastUpdateBlock: number
}

export interface AssetBackingView {
  token: Token
  aquaAllocation: TokenAmount
  walletBalance: TokenAmount
  aquaAllowance: TokenAmount
  logicalOutgoing: TokenAmount
  sufficientlyBacked: boolean
}

export interface PositionDetail extends PositionSummary {
  encodingVersion: number
  salt: Bytes32
  strategy: Hex | null
  baseBacking: AssetBackingView
  quoteBacking: AssetBackingView
  createdAtBlock: number
  createdTransaction: Hex
  warnings: string[]
  meta: DataMeta
}

export interface CurveDraft {
  startPrice: DecimalString
  endPrice: DecimalString
  alpha: DecimalString
  initialReserve: DecimalString
}

export interface PositionDraft {
  baseToken: Token
  quoteToken: Token
  salt?: Bytes32
  sell: CurveDraft
  buy: CurveDraft
}

export interface ValidationIssue {
  path: 'market' | 'sell.startPrice' | 'sell.endPrice' | 'sell.alpha'
    | 'sell.initialReserve' | 'buy.startPrice' | 'buy.endPrice'
    | 'buy.alpha' | 'buy.initialReserve'
  severity: 'error' | 'warning'
  code: string
  message: string
}

export interface CurveDraftPreview {
  side: CurveSide
  branch: CurveBranch
  canonicalAlpha: DecimalString
  startPrice: DisplayPrice
  endPrice: DisplayPrice
  initialReserve: TokenAmount
  marginalSamples: CurveSample[]
}

export interface PositionPreview {
  draft: PositionDraft
  sell: CurveDraftPreview | null
  buy: CurveDraftPreview | null
  initialSpreadBps: number | null
  canPublish: boolean
  issues: ValidationIssue[]
  policyHash: Bytes32 | null
  payload: Hex | null
  meta: DataMeta
}

export interface QuoteRequest {
  marketId: Bytes32
  side: CurveSide
  kind: QuoteKind
  /** Caller-fixed raw amount: input for exact-input, output for exact-output. */
  amount: {
    token: Address
    raw: RawAmount
  }
  slippageBps: number
  recipient?: Address
  deadlineSeconds?: number
}

export interface RouteFillView {
  index: number
  positionId: Bytes32
  positionKey: Bytes32
  maker: Address
  expectedVersion: number
  amountIn: TokenAmount
  amountOut: TokenAmount
  displayedPriceBefore: DisplayPrice
  displayedPriceAfter: DisplayPrice
  displayedEffectivePrice: DisplayPrice
  nativeRateBefore: NativeRate
  nativeRateAfter: NativeRate
  activeProgressBeforeBps: number
  activeProgressAfterBps: number
  oppositeInventoryCredit: TokenAmount
}

export interface RouteSimulation {
  status: 'success' | 'reverted' | 'not-run'
  blockNumber: number | null
  gasEstimate: RawAmount | null
  revertCode: string | null
  message: string
}

export interface RouteQuote {
  id: string
  marketId: Bytes32
  side: CurveSide
  kind: QuoteKind
  amountIn: TokenAmount
  amountOut: TokenAmount
  limit: TokenAmount
  slippageBps: number
  displayedEffectivePrice: DisplayPrice
  worstMarginalPrice: DisplayPrice
  priceImpactBps: number
  fills: RouteFillView[]
  simulation: RouteSimulation
  createdAt: IsoTimestamp
  expiresAt: IsoTimestamp
  meta: DataMeta
}

export interface PublishPositionRequest {
  maker: Address
  draft: PositionDraft
}

export interface ExecuteRouteRequest {
  payer: Address
  quote: RouteQuote
  recipient: Address
  refundRecipient: Address
}

export interface DockPositionRequest {
  maker: Address
  positionId: Bytes32
}

export interface ReplacePositionRequest {
  maker: Address
  positionId: Bytes32
  replacement: PositionDraft
}

export type TransactionAction =
  | 'approve-aqua'
  | 'approve-executor'
  | 'publish-position'
  | 'execute-route'
  | 'dock-position'

export interface PreparedTransaction {
  chainId: number
  from: Address
  to: Address
  data: Hex
  value: RawAmount
}

export interface TransactionStep {
  id: string
  order: number
  action: TransactionAction
  title: string
  description: string
  transaction: PreparedTransaction
  expectedEvent: string
}

export interface TransactionPlan {
  id: string
  mode: FrontendMode
  action: 'publish' | 'execute' | 'dock' | 'replace'
  /** Mock plans are intentionally false and must never reach a wallet. */
  sendable: boolean
  steps: TransactionStep[]
  warnings: string[]
  meta: DataMeta
}

export interface ActivityItem {
  id: string
  type: 'position-published' | 'curve-filled' | 'route-executed' | 'position-docked'
  marketId: Bytes32
  positionId: Bytes32 | null
  routeId: Bytes32 | null
  maker: Address | null
  side: CurveSide | null
  amountIn: TokenAmount | null
  amountOut: TokenAmount | null
  blockNumber: number
  transactionHash: Hex
  timestamp: IsoTimestamp
}

export interface MarketQuery {
  search?: string
  cursor?: string
  limit?: number
}

export interface PositionQuery {
  marketId?: Bytes32
  maker?: Address
  lifecycle?: PositionLifecycle
  side?: CurveSide
  cursor?: string
  limit?: number
}

export interface ActivityQuery {
  marketId?: Bytes32
  maker?: Address
  type?: ActivityItem['type']
  cursor?: string
  limit?: number
}
