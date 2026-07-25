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
})
