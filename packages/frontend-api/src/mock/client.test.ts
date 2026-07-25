import { describe, expect, it } from 'vitest'
import type { PositionDraft } from '../types.js'
import { FrontendGatewayError } from '../errors.js'
import { createMockLiquidOBClient } from './client.js'
import {
  BASE_TOKEN,
  MAKER_A,
  MARKET_ID,
  POSITIONS,
  QUOTE_TOKEN,
} from './fixtures.js'

const FIXED_TIME = new Date('2026-07-25T16:00:00.000Z')

function client() {
  return createMockLiquidOBClient({
    latencyMs: 0,
    now: () => new Date(FIXED_TIME),
  })
}

function validDraft(): PositionDraft {
  return {
    baseToken: BASE_TOKEN,
    quoteToken: QUOTE_TOKEN,
    sell: {
      startPrice: '2000',
      endPrice: '2400',
      alpha: '2',
      initialReserve: '5',
    },
    buy: {
      startPrice: '1950',
      endPrice: '1500',
      alpha: '0',
      initialReserve: '8000',
    },
  }
}

describe('mock frontend gateway', () => {
  it('makes mock provenance and disabled live writes impossible to miss', async () => {
    const bootstrap = await client().getBootstrap()

    expect(bootstrap.mode).toBe('mock')
    expect(bootstrap.network.chainId).toBe(31_337)
    expect(bootstrap.features.liveWrites).toBe(false)
    expect(bootstrap.meta.warnings[0]).toMatch(/mock data/i)
  })

  it('serves clone-safe market, position, and pagination fixtures', async () => {
    const gateway = client()
    const markets = await gateway.listMarkets({ limit: 1 })
    const positions = await gateway.listPositions({ marketId: MARKET_ID, limit: 2 })

    expect(markets.items).toHaveLength(1)
    expect(positions.items).toHaveLength(2)
    expect(positions.pageInfo.hasNextPage).toBe(true)
    positions.items[0]!.runtimeVersion = 999
    expect((await gateway.getPosition(POSITIONS[0]!.id)).runtimeVersion).toBe(7)
  })

  it('previews valid curves and canonicalizes flat alpha', async () => {
    const gateway = client()
    const draft = validDraft()
    draft.sell.endPrice = draft.sell.startPrice
    draft.sell.alpha = '20'
    const preview = await gateway.previewPosition(draft)

    expect(preview.canPublish).toBe(true)
    expect(preview.sell?.branch).toBe('flat')
    expect(preview.sell?.canonicalAlpha).toBe('0')
    expect(preview.sell?.marginalSamples).toHaveLength(21)
    expect(preview.issues).toContainEqual(expect.objectContaining({
      code: 'FLAT_ALPHA_CANONICALIZED',
      severity: 'warning',
    }))
  })

  it('keeps extreme ranges finite across the full supported alpha interval', async () => {
    const gateway = client()
    const draft = validDraft()
    draft.sell = {
      ...draft.sell,
      startPrice: '0.0001',
      endPrice: '1000000000000000000000000000000',
      alpha: '20',
    }
    draft.buy = {
      ...draft.buy,
      startPrice: '1000000000000000000000000000000',
      endPrice: '0.0001',
      alpha: '-20',
    }

    const preview = await gateway.previewPosition(draft)
    const samples = [
      ...(preview.sell?.marginalSamples ?? []),
      ...(preview.buy?.marginalSamples ?? []),
    ]

    expect(preview.canPublish).toBe(true)
    expect(samples).toHaveLength(42)
    expect(samples.every((sample) => (
      Number.isFinite(Number(sample.displayedMarginalPrice.formatted))
      && Number(sample.displayedMarginalPrice.formatted) > 0
    ))).toBe(true)
  })

  it('rejects alpha values outside the composer interval', async () => {
    const gateway = client()
    const draft = validDraft()
    draft.sell.alpha = '20.01'

    const preview = await gateway.previewPosition(draft)

    expect(preview.canPublish).toBe(false)
    expect(preview.issues).toContainEqual(expect.objectContaining({
      code: 'ALPHA_OUT_OF_RANGE',
      severity: 'error',
    }))
  })

  it('returns validation issues instead of malformed preview values', async () => {
    const gateway = client()
    const draft = validDraft()
    draft.buy.endPrice = '2500'
    draft.sell.initialReserve = '1e3'
    const preview = await gateway.previewPosition(draft)

    expect(preview.canPublish).toBe(false)
    expect(preview.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      'WRONG_ENDPOINT_ORDER',
      'INVALID_RESERVE',
    ]))
  })

  it('quotes an exact input across two makers with transparent freshness', async () => {
    const quote = await client().quote({
      marketId: MARKET_ID,
      side: 'sell',
      kind: 'exact-input',
      amount: {
        token: QUOTE_TOKEN.address,
        raw: '1000000000',
      },
      slippageBps: 50,
    })

    expect(quote.amountIn.raw).toBe('1000000000')
    expect(BigInt(quote.amountOut.raw)).toBeGreaterThan(0n)
    expect(quote.fills).toHaveLength(2)
    expect(quote.fills.reduce(
      (sum, fill) => sum + BigInt(fill.amountIn.raw),
      0n,
    )).toBe(1_000_000_000n)
    expect(quote.simulation.status).toBe('success')
    expect(quote.meta.indexLag).toBe(2)
  })

  it('quotes exact output with maker-favorable input rounding', async () => {
    const quote = await client().quote({
      marketId: MARKET_ID,
      side: 'sell',
      kind: 'exact-output',
      amount: {
        token: BASE_TOKEN.address,
        raw: '500000000000000000',
      },
      slippageBps: 100,
    })

    expect(quote.amountOut.raw).toBe('500000000000000000')
    expect(BigInt(quote.limit.raw)).toBeGreaterThan(BigInt(quote.amountIn.raw))
    expect(quote.fills.every((fill) => fill.oppositeInventoryCredit.token.symbol
      === QUOTE_TOKEN.symbol)).toBe(true)
  })

  it('rejects routes that exceed the deterministic maker capacity', async () => {
    await expect(client().quote({
      marketId: MARKET_ID,
      side: 'sell',
      kind: 'exact-output',
      amount: {
        token: BASE_TOKEN.address,
        raw: '1000000000000000000000000',
      },
      slippageBps: 100,
    })).rejects.toMatchObject({ code: 'INSUFFICIENT_LIQUIDITY' })
  })

  it('builds complete but deliberately unsendable transaction plans', async () => {
    const gateway = client()
    const publish = await gateway.preparePublish({
      maker: MAKER_A,
      draft: validDraft(),
    })
    const quote = await gateway.quote({
      marketId: MARKET_ID,
      side: 'sell',
      kind: 'exact-input',
      amount: { token: QUOTE_TOKEN.address, raw: '100000000' },
      slippageBps: 50,
    })
    const execute = await gateway.prepareExecute({
      payer: MAKER_A,
      recipient: MAKER_A,
      refundRecipient: MAKER_A,
      quote,
    })

    expect(publish.sendable).toBe(false)
    expect(publish.steps.map((step) => step.action)).toEqual([
      'approve-aqua',
      'approve-aqua',
      'publish-position',
    ])
    expect(execute.sendable).toBe(false)
    expect(execute.steps.at(-1)?.expectedEvent).toBe('RouteExecuted')
  })

  it('supports cancellation through AbortSignal', async () => {
    const gateway = createMockLiquidOBClient({ latencyMs: 100 })
    const controller = new AbortController()
    const request = gateway.listMarkets({}, { signal: controller.signal })
    controller.abort()

    await expect(request).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('returns stable typed errors for unknown entities', async () => {
    await expect(client().getPosition(
      `0x${'0'.repeat(64)}`,
    )).rejects.toBeInstanceOf(FrontendGatewayError)
  })
})
