export type FrontendErrorCode =
  | 'ABORTED'
  | 'INVALID_ARGUMENT'
  | 'INVALID_AMOUNT'
  | 'NOT_FOUND'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'FEATURE_UNAVAILABLE'
  | 'STALE_QUOTE'
  | 'UNSUPPORTED_NETWORK'
  | 'UNBACKED_POSITION'
  | 'SIMULATION_REVERTED'
  | 'SERVICE_UNAVAILABLE'

export class FrontendGatewayError extends Error {
  readonly code: FrontendErrorCode
  readonly retryable: boolean
  readonly details: Record<string, unknown>

  constructor(
    code: FrontendErrorCode,
    message: string,
    options: {
      retryable?: boolean
      details?: Record<string, unknown>
    } = {},
  ) {
    super(message)
    this.name = 'FrontendGatewayError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.details = options.details ?? {}
  }
}
