import { WAD, compileCurve } from '@liquid-ob/curve-math'
import { describe, expect, it, vi } from 'vitest'

import { LiquidOBGraphClient } from '../graph-client.js'
import { BASE, MAKER, MARKET, QUOTE, hex } from './fixtures.js'

const curve = compileCurve({
  startPriceWad: 2n * WAD,
  endPriceWad: 2n * WAD,
  alphaWad: 0n,
  initialReserveWad: 10n * WAD,
}, 'buy')

function row(index: bigint) {
  return {
    id: `${hex(index)}-BUY`,
    side: 'BUY',
    branch: 'FLAT',
    startPriceWad: curve.startPriceWad.toString(),
    endPriceWad: curve.endPriceWad.toString(),
    alphaWad: curve.alphaWad.toString(),
    alphaNativeWad: curve.alphaNativeWad.toString(),
    betaNativeWad: curve.betaNativeWad.toString(),
    pLowWad: curve.pLowWad.toString(),
    pHighWad: curve.pHighWad.toString(),
    muWad: curve.muWad.toString(),
    kappaWad: curve.kappaWad.toString(),
    initialReserveWad: curve.initialReserveWad.toString(),
    yWad: curve.initialReserveWad.toString(),
    yIntWad: curve.initialReserveWad.toString(),
    active: true,
    lastUpdateBlock: '10',
    position: {
      id: hex(index),
      positionKey: hex(index),
      strategyHash: hex(index + 100n),
      strategy: '0x00',
      runtimeVersion: '1',
      active: true,
      sufficientlyAllocated: true,
      maker: { address: MAKER },
      market: {
        marketId: MARKET,
        baseToken: { address: BASE, symbol: 'BASE', name: 'Base', decimals: 18 },
        quoteToken: { address: QUOTE, symbol: 'QUOTE', name: 'Quote', decimals: 18 },
      },
    },
  }
}

function response(block: number, rows: ReturnType<typeof row>[]): Response {
  return new Response(JSON.stringify({
    data: {
      _meta: { block: { number: block, hash: hex(BigInt(block)) }, hasIndexingErrors: false },
      curveSides: rows,
    },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
}

describe('LiquidOBGraphClient', () => {
  it('paginates one immutable snapshot and normalizes solver candidates', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { variables: { skip: number } }
      if (body.variables.skip === 0) return response(10, [row(1n)])
      if (body.variables.skip === 1) return response(10, [row(2n)])
      return response(10, [])
    })
    const client = new LiquidOBGraphClient({ endpoint: 'https://graph.test', pageSize: 1, fetch })

    const snapshot = await client.candidates(MARKET, 'buy')

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(snapshot.indexedBlock).toBe(10n)
    expect(snapshot.baseToken.address).toBe(BASE)
    expect(snapshot.candidates.map((candidate) => candidate.positionKey)).toEqual([hex(1n), hex(2n)])
    expect(snapshot.candidates.every((candidate) => candidate.curve.branch === 'flat')).toBe(true)
  })

  it('rejects pagination across different indexed blocks', async () => {
    const fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { variables: { skip: number } }
      return body.variables.skip === 0 ? response(10, [row(1n)]) : response(11, [row(2n)])
    })
    const client = new LiquidOBGraphClient({ endpoint: 'https://graph.test', pageSize: 1, fetch })

    await expect(client.candidates(MARKET, 'buy')).rejects.toThrow('advanced during pagination')
  })
})
