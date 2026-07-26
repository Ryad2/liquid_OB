import { describe, expect, it, vi } from 'vitest'

import { buildServer } from '../server.js'
import type { RouteRequest } from '../types.js'
import { MARKET, PAYER } from './fixtures.js'

describe('solver HTTP server', () => {
  it('serializes bigint health fields as JSON strings', async () => {
    const server = await buildServer({
      service: {
        health: async () => ({ status: 'healthy', indexedBlock: 10n }),
        quote: async () => ({ amountInRaw: 1n }),
      },
    })

    const response = await server.inject({ method: 'GET', url: '/v1/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'healthy', indexedBlock: '10' })
    await server.close()
  })

  it('returns a stable validation error for malformed route requests', async () => {
    const server = await buildServer({
      service: { health: async () => ({}), quote: async () => ({}) },
    })

    const response = await server.inject({
      method: 'POST',
      url: '/v1/route',
      payload: { marketId: '0x01', side: 'buy' },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_REQUEST')
    await server.close()
  })

  it('rejects zero and amounts outside uint256 before calling the solver', async () => {
    const quote = vi.fn(async () => ({}))
    const server = await buildServer({ service: { health: async () => ({}), quote } })

    const payload = {
      marketId: MARKET,
      side: 'sell',
      kind: 'exact-input',
      slippageBps: 50,
      payer: PAYER,
      deadlineSeconds: 600,
    }
    const zero = await server.inject({
      method: 'POST',
      url: '/v1/quote',
      payload: { ...payload, amount: '0' },
    })
    const oversized = await server.inject({
      method: 'POST',
      url: '/v1/quote',
      payload: { ...payload, amount: '1'.repeat(79) },
    })

    expect(zero.statusCode).toBe(400)
    expect(oversized.statusCode).toBe(400)
    expect(quote).not.toHaveBeenCalled()
    await server.close()
  })

  it('uses simulation for executable routes and applies recipient defaults', async () => {
    const quote = vi.fn(async (route: RouteRequest, simulate: boolean) => ({
      marketId: route.marketId,
      recipient: route.recipient,
      simulation: { requested: simulate },
      amountInRaw: route.amount,
    }))
    const server = await buildServer({ service: { health: async () => ({}), quote } })

    const response = await server.inject({
      method: 'POST',
      url: '/v1/route',
      payload: {
        marketId: MARKET,
        side: 'buy',
        kind: 'exact-input',
        amount: '1000',
        slippageBps: 50,
        payer: PAYER,
        deadlineSeconds: 600,
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ recipient: PAYER, amountInRaw: '1000', simulation: { requested: true } })
    expect(quote).toHaveBeenCalledWith(expect.objectContaining({ refundRecipient: PAYER }), true, expect.anything())
    await server.close()
  })

  it('validates and forwards typed product filters', async () => {
    const positions = vi.fn(async () => ({ items: [] }))
    const server = await buildServer({
      service: { health: async () => ({}), quote: async () => ({}) },
      product: {
        bootstrap: async () => ({}),
        markets: async () => ({}),
        market: async () => ({}),
        positions,
        position: async () => ({}),
        activity: async () => ({}),
      },
    })

    const response = await server.inject({
      method: 'GET',
      url: `/v1/positions?marketId=${MARKET}&maker=${PAYER}&limit=2&side=sell`,
    })

    expect(response.statusCode).toBe(200)
    expect(positions).toHaveBeenCalledWith({ marketId: MARKET, maker: PAYER, limit: 2, side: 'sell' }, expect.anything())
    await server.close()
  })

  it('rejects malformed product identifiers before querying the read model', async () => {
    const server = await buildServer({
      service: { health: async () => ({}), quote: async () => ({}) },
      product: {
        bootstrap: async () => ({}),
        markets: async () => ({}),
        market: async () => ({}),
        positions: async () => ({}),
        position: async () => ({}),
        activity: async () => ({}),
      },
    })

    const response = await server.inject({ method: 'GET', url: '/v1/positions/0x1234' })

    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_REQUEST')
    await server.close()
  })

  it('reports liveness, dependency readiness, and bounded Prometheus metrics', async () => {
    const bootstrap = vi.fn(async () => ({ mode: 'live' }))
    const server = await buildServer({
      service: { health: async () => ({ status: 'healthy' }), quote: async () => ({}) },
      product: {
        bootstrap,
        markets: async () => ({}),
        market: async () => ({}),
        positions: async () => ({}),
        position: async () => ({}),
        activity: async () => ({}),
      },
    })

    expect((await server.inject({ method: 'GET', url: '/livez' })).json().status).toBe('alive')
    expect((await server.inject({ method: 'GET', url: '/readyz' })).json()).toEqual({ status: 'ready' })
    const metrics = await server.inject({ method: 'GET', url: '/metrics' })
    expect(metrics.headers['content-type']).toContain('text/plain')
    expect(metrics.body).toContain('liquid_ob_api_http_requests_total')
    expect(metrics.body).toContain('route="/livez"')
    expect(bootstrap).toHaveBeenCalledOnce()
    await server.close()
  })

  it('fails readiness when RPC or indexing health is degraded', async () => {
    const server = await buildServer({
      service: { health: async () => ({ status: 'degraded' }), quote: async () => ({}) },
    })

    const response = await server.inject({ method: 'GET', url: '/readyz' })

    expect(response.statusCode).toBe(503)
    expect(response.json().error.code).toBe('SUBGRAPH_UNAVAILABLE')
    await server.close()
  })
})
