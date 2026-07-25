import { aquaAbi, erc20Abi } from '@liquid-ob/contracts'
import type { Address, PositionDraft } from '@liquid-ob/frontend-api'
import { decodeFunctionData, toHex, type PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { LiveLiquidOBClient } from './client.js'

const contracts = Array.from({ length: 6 }, (_value, index) => (
  `0x${(index + 1).toString(16).padStart(40, '0')}` as Address
))
const maker = '0x0000000000000000000000000000000000000010' as Address
const base = { address: '0x0000000000000000000000000000000000000020' as Address, chainId: 84_532, symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 }
const quote = { address: '0x0000000000000000000000000000000000000030' as Address, chainId: 84_532, symbol: 'USDC', name: 'USD Coin', decimals: 6 }

function deployment(address: Address, source: string) {
  return {
    address,
    deploymentBlock: 10,
    transactionHash: toHex(10n, { size: 32 }),
    runtimeCodeHash: toHex(20n, { size: 32 }),
    source,
  }
}

function manifest() {
  return {
    schemaVersion: 1,
    protocol: 'Liquid OB',
    protocolVersion: '1',
    network: {
      chainId: 84_532,
      name: 'Base Sepolia',
      nativeCurrencySymbol: 'ETH',
      publicRpcUrl: 'https://rpc.example.test',
      explorerUrl: 'https://sepolia.basescan.org',
    },
    release: {
      public: true,
      deploymentBlock: 10,
      deploymentTransaction: toHex(10n, { size: 32 }),
      deployedAt: '2026-07-26T00:00:00.000Z',
      repository: 'https://github.com/Ryad2/liquid_OB',
      sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    },
    config: { maxFills: 8, positionEncodingVersion: 1 },
    contracts: {
      aqua: deployment(contracts[0]!, 'official-aqua-source'),
      curveKernel: deployment(contracts[1]!, 'liquid-ob'),
      router: deployment(contracts[2]!, 'liquid-ob'),
      quoter: deployment(contracts[3]!, 'liquid-ob'),
      lens: deployment(contracts[4]!, 'liquid-ob'),
      batchExecutor: deployment(contracts[5]!, 'liquid-ob'),
    },
    demoTokens: [],
  }
}

function bootstrap(router = contracts[2]!) {
  const meta = {
    mode: 'live',
    source: 'composed',
    generatedAt: '2026-07-26T00:00:00.000Z',
    chainHeadBlock: 12,
    indexedBlock: 11,
    indexLag: 1,
    stale: false,
    warnings: [],
  }
  return {
    protocolName: 'ArcBook',
    protocolVersion: '1',
    mode: 'live',
    network: { chainId: 84_532, name: 'Base Sepolia', explorerUrl: 'https://sepolia.basescan.org', nativeCurrencySymbol: 'ETH' },
    deploymentBlock: 10,
    addresses: {
      aqua: contracts[0],
      swapVmRouter: router,
      curveKernel: contracts[1],
      liquidOBRouter: router,
      quoter: contracts[3],
      lens: contracts[4],
      batchExecutor: contracts[5],
    },
    services: [
      { name: 'rpc', health: 'healthy', url: null, message: 'ready' },
      { name: 'subgraph', health: 'healthy', url: null, message: 'ready' },
      { name: 'solver', health: 'healthy', url: null, message: 'ready' },
    ],
    features: {
      marketExplorer: true,
      makerPreview: true,
      publishPosition: true,
      positionManagement: true,
      exactInputQuotes: true,
      exactOutputQuotes: true,
      executeRoutes: true,
      liveWrites: true,
    },
    tokens: [base, quote],
    meta,
  }
}

function draft(overrides: Partial<PositionDraft> = {}): PositionDraft {
  return {
    baseToken: base,
    quoteToken: quote,
    salt: toHex(99n, { size: 32 }),
    sell: { startPrice: '2000', endPrice: '2300', alpha: '2', initialReserve: '3' },
    buy: { startPrice: '1900', endPrice: '1500', alpha: '0', initialReserve: '5000' },
    ...overrides,
  }
}

function fetcher(apiBootstrap = bootstrap()) {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    const body = url.includes('manifest') ? manifest() : apiBootstrap
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  })
}

describe('LiveLiquidOBClient', () => {
  it('compiles exact local previews and canonicalizes flat alpha', async () => {
    const client = new LiveLiquidOBClient({ apiUrl: 'https://api.test', manifestUrl: 'https://app.test/manifest.json' })
    const preview = await client.previewPosition(draft({
      sell: { startPrice: '2000', endPrice: '2000', alpha: '123', initialReserve: '3' },
    }))

    expect(preview.canPublish).toBe(true)
    expect(preview.sell?.branch).toBe('flat')
    expect(preview.sell?.canonicalAlpha).toBe('0')
    expect(preview.sell?.marginalSamples).toHaveLength(21)
    expect(preview.payload).toMatch(/^0x4c4f4231/)
    expect(preview.policyHash).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('returns field-level errors instead of compiling an invalid endpoint order', async () => {
    const client = new LiveLiquidOBClient({ apiUrl: 'https://api.test', manifestUrl: 'https://app.test/manifest.json' })
    const preview = await client.previewPosition(draft({
      buy: { startPrice: '1500', endPrice: '1900', alpha: '1', initialReserve: '5000' },
    }))

    expect(preview.canPublish).toBe(false)
    expect(preview.issues).toContainEqual(expect.objectContaining({ path: 'buy.endPrice', code: 'WRONG_ENDPOINT_ORDER' }))
  })

  it('prepares real ERC-20 approvals followed by an Aqua ship call', async () => {
    const fetch = fetcher()
    const publicClient = { readContract: vi.fn(async () => 1) } as unknown as PublicClient
    const client = new LiveLiquidOBClient({
      apiUrl: 'https://api.test',
      manifestUrl: 'https://app.test/manifest.json',
      fetch,
      publicClient,
      now: () => new Date('2026-07-26T00:00:00.000Z'),
    })

    const plan = await client.preparePublish({ maker, draft: draft() })
    const approval = decodeFunctionData({ abi: erc20Abi, data: plan.steps[0]!.transaction.data })
    const ship = decodeFunctionData({ abi: aquaAbi, data: plan.steps[2]!.transaction.data })

    expect(plan.sendable).toBe(true)
    expect(plan.steps.map((step) => step.action)).toEqual(['approve-aqua', 'approve-aqua', 'publish-position'])
    expect(approval.functionName).toBe('approve')
    expect(ship.functionName).toBe('ship')
  })

  it('fails closed when API and deployment manifest addresses differ', async () => {
    const wrongRouter = '0x0000000000000000000000000000000000000099' as Address
    const client = new LiveLiquidOBClient({
      apiUrl: 'https://api.test',
      manifestUrl: 'https://app.test/manifest.json',
      fetch: fetcher(bootstrap(wrongRouter)),
    })

    await expect(client.getBootstrap()).rejects.toThrow('disagree on liquidOBRouter')
  })
})
