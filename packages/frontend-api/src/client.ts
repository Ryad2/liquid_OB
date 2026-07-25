import type {
  ActivityItem,
  ActivityQuery,
  Bytes32,
  DockPositionRequest,
  ExecuteRouteRequest,
  FrontendBootstrap,
  MarketDetail,
  MarketQuery,
  MarketSummary,
  Page,
  PositionDetail,
  PositionDraft,
  PositionPreview,
  PositionQuery,
  PositionSummary,
  PublishPositionRequest,
  QuoteRequest,
  ReplacePositionRequest,
  RouteQuote,
  TransactionPlan,
} from './types.js'

export interface RequestOptions {
  signal?: AbortSignal
}

/**
 * The only protocol boundary UI components should consume.
 *
 * The mock implementation is available now. Future live adapters must retain
 * this contract while composing manifests, local curve math, The Graph, the
 * solver API, RPC reads, and transaction encoders behind it.
 */
export interface LiquidOBFrontendClient {
  getBootstrap(options?: RequestOptions): Promise<FrontendBootstrap>
  listMarkets(query?: MarketQuery, options?: RequestOptions): Promise<Page<MarketSummary>>
  getMarket(marketId: Bytes32, options?: RequestOptions): Promise<MarketDetail>
  listPositions(
    query?: PositionQuery,
    options?: RequestOptions,
  ): Promise<Page<PositionSummary>>
  getPosition(positionId: Bytes32, options?: RequestOptions): Promise<PositionDetail>
  previewPosition(
    draft: PositionDraft,
    options?: RequestOptions,
  ): Promise<PositionPreview>
  quote(request: QuoteRequest, options?: RequestOptions): Promise<RouteQuote>
  listActivity(
    query?: ActivityQuery,
    options?: RequestOptions,
  ): Promise<Page<ActivityItem>>
  preparePublish(
    request: PublishPositionRequest,
    options?: RequestOptions,
  ): Promise<TransactionPlan>
  prepareExecute(
    request: ExecuteRouteRequest,
    options?: RequestOptions,
  ): Promise<TransactionPlan>
  prepareDock(
    request: DockPositionRequest,
    options?: RequestOptions,
  ): Promise<TransactionPlan>
  prepareReplace(
    request: ReplacePositionRequest,
    options?: RequestOptions,
  ): Promise<TransactionPlan>
}
