import type { ActivityQuery, MarketQuery, PositionQuery } from '@liquid-ob/frontend-api'
import cors from '@fastify/cors'
import Fastify from 'fastify'
import { isAddress, isHex, type Address, type Hex } from 'viem'
import { z } from 'zod'

import { ApiError, normalizeError } from './errors.js'
import type { RouteRequest } from './types.js'

const bodySchema = z.object({
  marketId: z.string(),
  side: z.enum(['sell', 'buy']),
  kind: z.enum(['exact-input', 'exact-output']),
  amount: z.string().regex(/^\d+$/),
  slippageBps: z.number().int().min(0).max(1_000),
  payer: z.string(),
  recipient: z.string().optional(),
  refundRecipient: z.string().optional(),
  deadlineSeconds: z.number().int().min(30).max(3_600).default(600),
})

const pageSchema = z.object({
  cursor: z.string().regex(/^\d+$/).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})
const marketQuerySchema = pageSchema.extend({ search: z.string().max(100).optional() })
const positionQuerySchema = pageSchema.extend({
  marketId: z.string().optional(),
  maker: z.string().optional(),
  lifecycle: z.enum(['unknown', 'active', 'docked']).optional(),
  side: z.enum(['sell', 'buy']).optional(),
})
const activityQuerySchema = pageSchema.extend({
  marketId: z.string().optional(),
  maker: z.string().optional(),
  type: z.enum(['position-published', 'curve-filled', 'route-executed', 'position-docked']).optional(),
})

export interface ServerOptions {
  service: {
    health(signal?: AbortSignal): Promise<unknown>
    quote(request: RouteRequest, simulate: boolean, signal?: AbortSignal): Promise<unknown>
  }
  product?: {
    bootstrap(signal?: AbortSignal): Promise<unknown>
    markets(query?: MarketQuery, signal?: AbortSignal): Promise<unknown>
    market(marketId: Hex, signal?: AbortSignal): Promise<unknown>
    positions(query?: PositionQuery, signal?: AbortSignal): Promise<unknown>
    position(positionId: Hex, signal?: AbortSignal): Promise<unknown>
    activity(query?: ActivityQuery, signal?: AbortSignal): Promise<unknown>
  }
  corsOrigins?: string[]
  logger?: boolean
}

export async function buildServer(options: ServerOptions) {
  const server = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 64 * 1024,
    requestTimeout: 15_000,
  })
  await server.register(cors, {
    origin: options.corsOrigins?.length ? options.corsOrigins : false,
    methods: ['GET', 'POST'],
  })

  server.get('/', async () => ({
    service: 'Liquid OB Solver API',
    version: 1,
    endpoints: [
      '/v1/health', '/v1/bootstrap', '/v1/markets', '/v1/positions',
      '/v1/activity', '/v1/quote', '/v1/route',
    ],
  }))
  server.get('/v1/health', async (request) => toJson(await options.service.health(request.signal)))
  server.get('/v1/bootstrap', async (request) => toJson(await requireProduct(options).bootstrap(request.signal)))
  server.get('/v1/markets', async (request) => {
    const query = marketQuerySchema.parse(request.query) as MarketQuery
    return toJson(await requireProduct(options).markets(query, request.signal))
  })
  server.get('/v1/markets/:marketId', async (request) => {
    const marketId = bytes32Param(request.params, 'marketId')
    return toJson(await requireProduct(options).market(marketId, request.signal))
  })
  server.get('/v1/positions', async (request) => {
    const parsed = positionQuerySchema.parse(request.query)
    const query: PositionQuery = {
      ...(parsed.cursor === undefined ? {} : { cursor: parsed.cursor }),
      ...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
      ...(parsed.lifecycle === undefined ? {} : { lifecycle: parsed.lifecycle }),
      ...(parsed.side === undefined ? {} : { side: parsed.side }),
      ...(parsed.marketId === undefined ? {} : { marketId: bytes32(parsed.marketId, 'marketId') }),
      ...(parsed.maker === undefined ? {} : { maker: address(parsed.maker, 'maker') }),
    }
    return toJson(await requireProduct(options).positions(query, request.signal))
  })
  server.get('/v1/positions/:positionId', async (request) => {
    const positionId = bytes32Param(request.params, 'positionId')
    return toJson(await requireProduct(options).position(positionId, request.signal))
  })
  server.get('/v1/activity', async (request) => {
    const parsed = activityQuerySchema.parse(request.query)
    const query: ActivityQuery = {
      ...(parsed.cursor === undefined ? {} : { cursor: parsed.cursor }),
      ...(parsed.limit === undefined ? {} : { limit: parsed.limit }),
      ...(parsed.type === undefined ? {} : { type: parsed.type }),
      ...(parsed.marketId === undefined ? {} : { marketId: bytes32(parsed.marketId, 'marketId') }),
      ...(parsed.maker === undefined ? {} : { maker: address(parsed.maker, 'maker') }),
    }
    return toJson(await requireProduct(options).activity(query, request.signal))
  })
  server.post('/v1/quote', async (request) => {
    const route = await options.service.quote(parseRequest(request.body), false, request.signal)
    return toJson(route)
  })
  server.post('/v1/route', async (request) => {
    const route = await options.service.quote(parseRequest(request.body), true, request.signal)
    return toJson(route)
  })

  server.setNotFoundHandler(async (_request, reply) => {
    await reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Endpoint not found' } })
  })
  server.setErrorHandler(async (error, _request, reply) => {
    const normalized = error instanceof z.ZodError
      ? new ApiError('INVALID_REQUEST', 400, z.prettifyError(error))
      : normalizeError(error)
    await reply.code(normalized.statusCode).send({
      error: {
        code: normalized.code,
        message: normalized.message,
        ...(normalized.details === undefined ? {} : { details: normalized.details }),
      },
    })
  })
  return server
}

function requireProduct(options: ServerOptions): NonNullable<ServerOptions['product']> {
  if (options.product === undefined) throw new ApiError('INTERNAL_ERROR', 503, 'Product API is not configured')
  return options.product
}

function bytes32Param(params: unknown, name: string): Hex {
  const parsed = z.record(z.string(), z.string()).parse(params)
  return bytes32(parsed[name] ?? '', name)
}

function bytes32(value: string, name: string): Hex {
  if (!isHex(value) || value.length !== 66) throw new ApiError('INVALID_REQUEST', 400, `${name} must be bytes32`)
  return value as Hex
}

function address(value: string, name: string): Address {
  if (!isAddress(value)) throw new ApiError('INVALID_REQUEST', 400, `${name} must be an address`)
  return value as Address
}

function parseRequest(body: unknown): RouteRequest {
  const parsed = bodySchema.parse(body)
  if (!isHex(parsed.marketId) || parsed.marketId.length !== 66) {
    throw new ApiError('INVALID_REQUEST', 400, 'marketId must be bytes32')
  }
  if (!isAddress(parsed.payer)) throw new ApiError('INVALID_REQUEST', 400, 'payer must be an address')
  const recipient = parsed.recipient ?? parsed.payer
  const refundRecipient = parsed.refundRecipient ?? parsed.payer
  if (!isAddress(recipient) || !isAddress(refundRecipient)) {
    throw new ApiError('INVALID_REQUEST', 400, 'recipient addresses are invalid')
  }
  return {
    marketId: parsed.marketId as Hex,
    side: parsed.side,
    kind: parsed.kind,
    amount: BigInt(parsed.amount),
    slippageBps: parsed.slippageBps,
    payer: parsed.payer as Address,
    recipient,
    refundRecipient,
    deadlineSeconds: parsed.deadlineSeconds,
  }
}

function toJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value, (_key, entry: unknown) => (
    typeof entry === 'bigint' ? entry.toString() : entry
  )))
}
