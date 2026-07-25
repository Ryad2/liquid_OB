import { describe, expect, it, vi } from 'vitest'

import { LiquidOBProductGraphClient } from '../product-graph.js'
import { BASE, MARKET, QUOTE, hex } from './fixtures.js'

const meta = (block: number) => ({
  block: { number: block, hash: hex(BigInt(block)) },
  hasIndexingErrors: false,
})

function response(field: string, rows: unknown[], block = 10): Response {
  return new Response(JSON.stringify({ data: { _meta: meta(block), [field]: rows } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function productFetch(mismatchedField?: string) {
  return vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { query: string }
    if (body.query.includes('ProductHealth')) return response('unused', [])
    if (body.query.includes('query Markets')) {
      return response('markets', [{
        id: MARKET,
        marketId: MARKET,
        positionCount: '3',
        activePositionCount: '2',
        fillCount: '7',
        routeCount: '4',
        volumeBaseRaw: '100',
        volumeQuoteRaw: '200',
        lastUpdateBlock: '9',
        lastUpdateTimestamp: '1000',
        baseToken: { address: BASE, symbol: 'BASE', name: 'Base', decimals: 18 },
        quoteToken: { address: QUOTE, symbol: 'QUOTE', name: 'Quote', decimals: 18 },
      }], mismatchedField === 'markets' ? 11 : 10)
    }
    if (body.query.includes('query MarketSides')) {
      return response('curveSides', [
        { market: { id: MARKET }, side: 'BUY', currentPriceWad: '1900000000000000000' },
        { market: { id: MARKET }, side: 'BUY', currentPriceWad: '2000000000000000000' },
        { market: { id: MARKET }, side: 'SELL', currentPriceWad: '2100000000000000000' },
      ], mismatchedField === 'curveSides' ? 11 : 10)
    }
    if (body.query.includes('query MarketSnapshots')) {
      return response('marketSnapshots', [{
        market: { id: MARKET }, fillCount: '5', routeCount: '3',
        volumeBaseRaw: '90', volumeQuoteRaw: '180', lastUpdateBlock: '9',
      }], mismatchedField === 'marketSnapshots' ? 11 : 10)
    }
    throw new Error('Unexpected GraphQL query')
  })
}

describe('LiquidOBProductGraphClient', () => {
  it('composes market depth and daily statistics from one pinned block', async () => {
    const fetch = productFetch()
    const client = new LiquidOBProductGraphClient({ endpoint: 'https://graph.test', fetch })

    const snapshot = await client.markets()

    expect(fetch).toHaveBeenCalledTimes(4)
    expect(snapshot.indexedBlock).toBe(10n)
    expect(snapshot.items).toHaveLength(1)
    expect(snapshot.items[0]).toMatchObject({
      id: MARKET,
      bestBidWad: 2_000_000_000_000_000_000n,
      bestAskWad: 2_100_000_000_000_000_000n,
      activeBuySides: 2,
      activeSellSides: 1,
      dayFillCount: 5n,
      dayVolumeQuoteRaw: 180n,
    })
  })

  it('rejects a product view assembled from different indexed blocks', async () => {
    const client = new LiquidOBProductGraphClient({
      endpoint: 'https://graph.test',
      fetch: productFetch('curveSides'),
    })

    await expect(client.markets()).rejects.toThrow('different block')
  })
})
