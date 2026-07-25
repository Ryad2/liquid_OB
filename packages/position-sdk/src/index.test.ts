import {
  aquaAbi,
  batchExecutorAbi,
  erc20Abi,
  type DeploymentManifest,
} from '@liquid-ob/contracts'
import { compilePosition } from '@liquid-ob/curve-math'
import { decodeFunctionData, type Address, type Hex } from 'viem'
import { describe, expect, it } from 'vitest'

import {
  buildDockPositionCall,
  buildExecuteExactInputCall,
  buildPublishPositionPlan,
} from './builders.js'

const address = (suffix: number): Address =>
  `0x${suffix.toString(16).padStart(40, '0')}` as Address
const hash = (byte: string): Hex => `0x${byte.repeat(64)}` as Hex

const manifest: DeploymentManifest = {
  schemaVersion: 1,
  protocol: 'Liquid OB',
  protocolVersion: '1',
  network: {
    chainId: 31_337,
    name: 'Anvil',
    nativeCurrencySymbol: 'ETH',
    publicRpcUrl: null,
    explorerUrl: null,
  },
  release: {
    public: false,
    deploymentBlock: 1,
    deploymentTransaction: hash('1'),
    deployedAt: '2026-07-25T20:00:00.000Z',
    repository: 'https://github.com/Ryad2/liquid_OB',
    sourceCommit: '1234567',
  },
  config: { maxFills: 8, positionEncodingVersion: 1 },
  contracts: {
    aqua: entry(address(1), 'official-aqua-source'),
    curveKernel: entry(address(2), 'liquid-ob'),
    router: entry(address(3), 'liquid-ob'),
    quoter: entry(address(4), 'liquid-ob'),
    lens: entry(address(5), 'liquid-ob'),
    batchExecutor: entry(address(6), 'liquid-ob'),
  },
  demoTokens: [],
}

describe('position sdk', () => {
  it('builds approvals and canonical Aqua ship calldata', () => {
    const maker = address(10)
    const config = compilePosition({
      baseToken: address(20),
      quoteToken: address(21),
      salt: hash('a'),
      sell: {
        startPriceWad: 1_900n * 10n ** 18n,
        endPriceWad: 2_100n * 10n ** 18n,
        alphaWad: 2n * 10n ** 18n,
        initialReserveWad: 100n * 10n ** 18n,
      },
      buy: {
        startPriceWad: 1_850n * 10n ** 18n,
        endPriceWad: 1_700n * 10n ** 18n,
        alphaWad: 0n,
        initialReserveWad: 185_000n * 10n ** 18n,
      },
    })
    const plan = buildPublishPositionPlan(manifest, {
      maker,
      config,
      liquidCurveOpcode: 0,
      baseAllocation: 100n * 10n ** 18n,
      quoteAllocation: 185_000n * 10n ** 18n,
    })

    expect(plan.calls).toHaveLength(3)
    expect(decodeFunctionData({ abi: erc20Abi, data: plan.calls[0]!.data }).functionName).toBe('approve')
    expect(decodeFunctionData({ abi: erc20Abi, data: plan.calls[1]!.data }).functionName).toBe('approve')
    expect(decodeFunctionData({ abi: aquaAbi, data: plan.calls[2]!.data }).functionName).toBe('ship')
    expect(plan.strategy.strategyHash).toMatch(/^0x[0-9a-f]{64}$/)
  })

  it('encodes a bounded exact-input route and complete dock', () => {
    const position = { maker: address(10), strategyHash: hash('b'), strategy: '0x1234' as Hex }
    const routeCall = buildExecuteExactInputCall(manifest, {
      baseToken: address(20),
      quoteToken: address(21),
      side: 0,
      salt: hash('c'),
      amountIn: 10n,
      minAmountOut: 4n,
      recipient: address(30),
      refundRecipient: address(30),
      deadline: 1_000,
      fills: [{ ...position, expectedVersion: 0n, amount: 10n }],
    })
    const dockCall = buildDockPositionCall(manifest, position, address(20), address(21))

    expect(
      decodeFunctionData({ abi: batchExecutorAbi, data: routeCall.data }).functionName,
    ).toBe('executeExactInput')
    expect(decodeFunctionData({ abi: aquaAbi, data: dockCall.data }).functionName).toBe('dock')
  })

  it('rejects duplicate positions before producing executable calldata', () => {
    const fill = {
      maker: address(10),
      strategyHash: hash('b'),
      expectedVersion: 0n,
      amount: 5n,
      strategy: '0x1234' as Hex,
    }
    expect(() => buildExecuteExactInputCall(manifest, {
      baseToken: address(20),
      quoteToken: address(21),
      side: 0,
      salt: hash('c'),
      amountIn: 10n,
      minAmountOut: 0n,
      recipient: address(30),
      refundRecipient: address(30),
      deadline: 1_000,
      fills: [fill, fill],
    })).toThrow(/Duplicate/)
  })
})

function entry(
  contractAddress: Address,
  source: 'liquid-ob' | 'official-aqua-source',
) {
  return {
    address: contractAddress,
    deploymentBlock: 1,
    transactionHash: hash('1'),
    runtimeCodeHash: hash('2'),
    source,
  }
}
