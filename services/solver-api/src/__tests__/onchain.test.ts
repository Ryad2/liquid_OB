import { batchExecutorAbi, type DeploymentManifest } from '@liquid-ob/contracts'
import { WAD } from '@liquid-ob/curve-math'
import { solveRoute } from '@liquid-ob/solver-core'
import { decodeFunctionData, toHex, type Address, type PublicClient } from 'viem'
import { describe, expect, it, vi } from 'vitest'

import { ViemChainGateway } from '../onchain.js'
import { candidate, market, request } from './fixtures.js'

interface MulticallInput {
  contracts: Array<{ functionName: string }>
}

const addresses = Array.from({ length: 6 }, (_value, index) => (
  `0x${(index + 100).toString(16).padStart(40, '0')}` as Address
))

const manifest: DeploymentManifest = {
  schemaVersion: 1,
  protocol: 'Liquid OB',
  protocolVersion: '1',
  network: {
    chainId: 31_337,
    name: 'anvil',
    nativeCurrencySymbol: 'ETH',
    publicRpcUrl: null,
    explorerUrl: null,
  },
  release: {
    public: false,
    deploymentBlock: 0,
    deploymentTransaction: null,
    deployedAt: '2026-07-26T00:00:00.000Z',
    repository: 'https://github.com/Ryad2/liquid_OB',
    sourceCommit: '1234567',
  },
  config: { maxFills: 8, positionEncodingVersion: 1 },
  contracts: {
    aqua: deployment(addresses[0]!, 'official-aqua-source'),
    curveKernel: deployment(addresses[1]!, 'liquid-ob'),
    router: deployment(addresses[2]!, 'liquid-ob'),
    quoter: deployment(addresses[3]!, 'liquid-ob'),
    lens: deployment(addresses[4]!, 'liquid-ob'),
    batchExecutor: deployment(addresses[5]!, 'liquid-ob'),
  },
  demoTokens: [],
}

function deployment(address: Address, source: 'official-aqua-source' | 'liquid-ob') {
  return {
    address,
    deploymentBlock: null,
    transactionHash: null,
    runtimeCodeHash: toHex(1n, { size: 32 }),
    source,
  }
}

function quote(amountIn: bigint, amountOut: bigint) {
  const position = candidate(1)
  return {
    marketId: position.marketId,
    positionKey: position.positionKey,
    strategyHash: position.strategyHash,
    curve: {
      amountIn,
      amountOut,
      nativeRateBefore: 2n * WAD,
      nativeRateAfter: 2n * WAD,
      displayedPriceBefore: 2n * WAD,
      displayedPriceAfter: 2n * WAD,
      displayedEffectivePrice: 2n * WAD,
    },
  }
}

describe('ViemChainGateway route preparation', () => {
  it('encodes and simulates an exact-input BatchExecutor route', async () => {
    const position = candidate(1)
    const snapshot = market([position])
    const routeRequest = request()
    const certificate = solveRoute({
      marketId: position.marketId,
      side: 'buy',
      kind: 'exact-input',
      amountWad: WAD,
      maxFills: 8,
      snapshotBlock: 10n,
      candidates: [position],
    })
    const multicall = vi.fn(async (_input: MulticallInput) => [quote(WAD, 2n * WAD)])
    const call = vi.fn(async () => ({ data: '0x' }))
    const estimateGas = vi.fn(async () => 345_678n)
    const client = { multicall, call, estimateGas } as unknown as PublicClient
    const gateway = new ViemChainGateway(client, manifest)

    const prepared = await gateway.prepareRoute(routeRequest, snapshot, certificate, 12n, true)
    const decoded = decodeFunctionData({ abi: batchExecutorAbi, data: prepared.transaction.data })

    expect(decoded.functionName).toBe('executeExactInput')
    expect(prepared.amountInRaw).toBe(WAD)
    expect(prepared.amountOutRaw).toBe(2n * WAD)
    expect(prepared.limitRaw).toBe(1_990_000_000_000_000_000n)
    expect(prepared.simulation).toEqual({ status: 'success', gasEstimate: 345_678n, blockNumber: 12n })
    expect(multicall.mock.calls[0]![0].contracts[0].functionName).toBe('quoteExactInput')
    expect(call).toHaveBeenCalledOnce()
  })

  it('encodes the separate exact-output ABI path', async () => {
    const position = candidate(1)
    const snapshot = market([position])
    const routeRequest = request({ kind: 'exact-output', amount: 2n * WAD })
    const certificate = solveRoute({
      marketId: position.marketId,
      side: 'buy',
      kind: 'exact-output',
      amountWad: 2n * WAD,
      maxFills: 8,
      snapshotBlock: 10n,
      candidates: [position],
    })
    const multicall = vi.fn(async (_input: MulticallInput) => [quote(WAD, 2n * WAD)])
    const client = { multicall } as unknown as PublicClient
    const gateway = new ViemChainGateway(client, manifest)

    const prepared = await gateway.prepareRoute(routeRequest, snapshot, certificate, 12n, false)
    const decoded = decodeFunctionData({ abi: batchExecutorAbi, data: prepared.transaction.data })

    expect(decoded.functionName).toBe('executeExactOutput')
    expect(prepared.limitRaw).toBe(1_005_000_000_000_000_000n)
    expect(prepared.simulation.status).toBe('not-run')
    expect(multicall.mock.calls[0]![0].contracts[0].functionName).toBe('quoteExactOutput')
  })
})
