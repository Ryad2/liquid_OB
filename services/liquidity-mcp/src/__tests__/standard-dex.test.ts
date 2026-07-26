import { describe, expect, it, vi } from 'vitest'

import { StandardDexGraphClient, quoteConstantProduct } from '../standard-dex.js'
import { BASE, market, QUOTE } from './fixtures.js'

describe('standardized DEX comparison', () => {
  it('quotes exact input and output with conservative integer rounding', () => {
    expect(quoteConstantProduct('1000', '1000', 'exact-input', '100', 0)).toEqual({ amountInRaw: '100', amountOutRaw: '90' })
    expect(quoteConstantProduct('1000', '1000', 'exact-output', '100', 0)).toEqual({ amountInRaw: '112', amountOutRaw: '100' })
    expect(quoteConstantProduct('1000', '1000', 'exact-output', '1000', 0)).toBeNull()
  })

  it('pins provenance and labels a constant-product Graph result as non-executable', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      data: {
        _meta: { block: { number: 99 }, hasIndexingErrors: false },
        liquidityPools: [{
          id: 'pool-1',
          name: 'Example',
          inputTokens: [
            { id: BASE, symbol: 'BASE', decimals: 18 },
            { id: QUOTE, symbol: 'QUOTE', decimals: 6 },
          ],
          inputTokenBalances: ['1000', '1000'],
          inputTokenBalancesUSD: ['1000', '1000'],
          totalValueLockedUSD: '2000',
          cumulativeVolumeUSD: '5000',
        }],
      },
    }), { status: 200 }))
    const client = new StandardDexGraphClient({
      endpoint: 'https://graph.example/subgraph',
      venue: 'Example V2',
      model: 'constant-product-v2',
      feeBps: 0,
      fetch,
    })

    const result = await client.compare(market, { side: 'sell', kind: 'exact-input', amountRaw: '100' })

    expect(result.indexedBlock).toBe(99)
    expect(result.bestEstimate).toEqual({ poolId: 'pool-1', amountInRaw: '100', amountOutRaw: '90' })
    expect(result.executionStatus).toBe('indexed-estimate-only')
    expect(result.caveats.join(' ')).toContain('not calldata')
  })
})
