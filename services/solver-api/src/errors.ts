import { SolverError } from '../../../packages/solver-core/src/index.js'

export type ApiErrorCode =
  | 'INVALID_REQUEST'
  | 'SUBGRAPH_UNAVAILABLE'
  | 'SUBGRAPH_STALE'
  | 'SUBGRAPH_INDEXING_ERROR'
  | 'INSUFFICIENT_LIQUIDITY'
  | 'RPC_UNAVAILABLE'
  | 'CHAIN_MISMATCH'
  | 'SIMULATION_REVERTED'
  | 'INTERNAL_ERROR'

export class ApiError extends Error {
  readonly code: ApiErrorCode
  readonly statusCode: number
  readonly details: Record<string, string> | undefined

  constructor(
    code: ApiErrorCode,
    statusCode: number,
    message: string,
    details?: Record<string, string>,
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.statusCode = statusCode
    this.details = details
  }
}

export function normalizeError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof SolverError) {
    const code = error.code === 'invalid-request' || error.code === 'duplicate-candidate'
      ? 'INVALID_REQUEST'
      : 'INSUFFICIENT_LIQUIDITY'
    return new ApiError(code, code === 'INVALID_REQUEST' ? 400 : 422, error.message)
  }
  return new ApiError(
    'INTERNAL_ERROR',
    500,
    error instanceof Error ? error.message : 'Unexpected solver API failure',
  )
}
