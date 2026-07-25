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

export interface ServerOptions {
  service: {
    health(signal?: AbortSignal): Promise<unknown>
    quote(request: RouteRequest, simulate: boolean, signal?: AbortSignal): Promise<unknown>
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
    endpoints: ['/v1/health', '/v1/quote', '/v1/route'],
  }))
  server.get('/v1/health', async (request) => toJson(await options.service.health(request.signal)))
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
