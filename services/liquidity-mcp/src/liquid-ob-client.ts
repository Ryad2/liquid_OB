import { z } from 'zod'

import {
  marketSchema,
  positionPageSchema,
  routeSchema,
  type Market,
  type Position,
  type PreparedRoute,
} from './schemas.js'

export interface RouteInput {
  marketId: string
  side: 'sell' | 'buy'
  kind: 'exact-input' | 'exact-output'
  amount: string
  slippageBps: number
  payer: string
  recipient?: string
  refundRecipient?: string
  deadlineSeconds: number
}

export interface PositionSnapshot {
  items: Position[]
  indexedBlock: number | null
  chainHeadBlock: number | null
  indexLag: number | null
  stale: boolean
  warnings: string[]
}

export interface LiquidOBGateway {
  market(marketId: string, signal?: AbortSignal): Promise<Market>
  activePositions(marketId: string, side: 'sell' | 'buy', signal?: AbortSignal): Promise<PositionSnapshot>
  quote(input: RouteInput, simulate: boolean, signal?: AbortSignal): Promise<PreparedRoute>
  health(signal?: AbortSignal): Promise<unknown>
}

interface ClientOptions {
  baseUrl: string
  timeoutMs?: number
  fetch?: typeof globalThis.fetch
  maxPositionPages?: number
}

export class LiquidOBApiClient implements LiquidOBGateway {
  readonly #baseUrl: string
  readonly #timeoutMs: number
  readonly #fetch: typeof globalThis.fetch
  readonly #maxPositionPages: number

  constructor(options: ClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/$/, '')
    this.#timeoutMs = options.timeoutMs ?? 8_000
    this.#fetch = options.fetch ?? globalThis.fetch
    this.#maxPositionPages = options.maxPositionPages ?? 20
  }

  async market(marketId: string, signal?: AbortSignal): Promise<Market> {
    return marketSchema.parse(await this.#json(`/v1/markets/${marketId}`, { method: 'GET' }, signal))
  }

  async activePositions(marketId: string, side: 'sell' | 'buy', signal?: AbortSignal): Promise<PositionSnapshot> {
    const items: Position[] = []
    let cursor: string | null = null
    let meta: z.infer<typeof positionPageSchema>['meta'] | undefined
    for (let page = 0; page < this.#maxPositionPages; page += 1) {
      const query = new URLSearchParams({ marketId, side, lifecycle: 'active', limit: '100' })
      if (cursor !== null) query.set('cursor', cursor)
      const parsed = positionPageSchema.parse(await this.#json(`/v1/positions?${query}`, { method: 'GET' }, signal))
      items.push(...parsed.items)
      meta = parsed.meta
      if (!parsed.pageInfo.hasNextPage || parsed.pageInfo.cursor === null) break
      cursor = parsed.pageInfo.cursor
      if (page === this.#maxPositionPages - 1) throw new Error('ArcBook position pagination exceeded the safety bound')
    }
    if (meta === undefined) throw new Error('ArcBook position response contained no metadata')
    return {
      items,
      indexedBlock: meta.indexedBlock,
      chainHeadBlock: meta.chainHeadBlock,
      indexLag: meta.indexLag,
      stale: meta.stale,
      warnings: meta.warnings,
    }
  }

  async quote(input: RouteInput, simulate: boolean, signal?: AbortSignal): Promise<PreparedRoute> {
    return routeSchema.parse(await this.#json(simulate ? '/v1/route' : '/v1/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }, signal))
  }

  async health(signal?: AbortSignal): Promise<unknown> {
    return this.#json('/v1/health', { method: 'GET' }, signal)
  }

  async #json(path: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> {
    const timeout = AbortSignal.timeout(this.#timeoutMs)
    const combined = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
    const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, signal: combined })
    const body: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const envelope = z.object({ error: z.object({ code: z.string(), message: z.string() }) }).safeParse(body)
      const detail = envelope.success ? `${envelope.data.error.code}: ${envelope.data.error.message}` : `HTTP ${response.status}`
      throw new Error(`ArcBook API request failed: ${detail}`)
    }
    return body
  }
}
