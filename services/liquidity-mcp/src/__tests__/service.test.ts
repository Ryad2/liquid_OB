import { describe, expect, it, vi } from 'vitest'

import { ExecutableLiquidityService } from '../service.js'
import { FakeDex, FakeLiquidOB, MARKET_ID, PAYER, POSITION_ID, route } from './fixtures.js'

const request = {
  marketId: MARKET_ID,
  side: 'sell' as const,
  kind: 'exact-input' as const,
  amount: '100',
  slippageBps: 50,
  payer: PAYER,
  recipient: PAYER,
  refundRecipient: PAYER,
  deadlineSeconds: 600,
}

describe('executable liquidity service', () => {
  const service = new ExecutableLiquidityService(new FakeLiquidOB(), new FakeDex())

  it('discovers backed curve state with block provenance', async () => {
    const result = await service.discoverPositions({ marketId: MARKET_ID, side: 'sell', limit: 20 })

    expect(result.positions).toEqual([expect.objectContaining({ positionId: POSITION_ID, availableOutputRaw: '1000' })])
    expect(result.provenance).toMatchObject({ indexedBlock: 103, chainHeadBlock: 105, stale: false })
  })

  it('returns calldata only from the fully simulated route path', async () => {
    const quote = await service.quoteLiquidOb(request)
    const route = await service.buildCandidateRoute(request)

    expect(quote).toMatchObject({ executionStatus: 'unsigned-quote', transaction: null })
    expect(route).toMatchObject({ executionStatus: 'onchain-simulated', transaction: { data: '0x1234' } })
  })

  it('keeps Graph DEX estimates semantically distinct from executable routes', async () => {
    const result = await service.compareExecutableLiquidity(request)

    expect(result.comparison).toMatchObject({ status: 'indicative-only', preferredVenue: 'ArcBook' })
    expect(result.semanticWarning).toContain('never executable calldata')
  })

  it('fails readiness and comparison closed when upstream evidence is degraded', async () => {
    const liquidOb = new FakeLiquidOB()
    vi.spyOn(liquidOb, 'health').mockResolvedValue({ status: 'degraded', indexedBlock: '103' })
    vi.spyOn(liquidOb, 'quote').mockResolvedValue({
      ...route,
      simulation: { status: 'not-run', gasEstimate: null, blockNumber: null },
    })
    const guarded = new ExecutableLiquidityService(liquidOb, new FakeDex())

    await expect(guarded.health()).rejects.toThrow('not healthy')
    await expect(guarded.compareExecutableLiquidity(request)).resolves.toMatchObject({
      liquidOb: { available: false },
      comparison: { status: 'not-comparable' },
    })
  })
})
