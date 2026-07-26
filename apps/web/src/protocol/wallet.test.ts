import type { Address, FrontendBootstrap, TransactionPlan } from '@liquid-ob/frontend-api'
import { afterEach, describe, expect, it } from 'vitest'

import {
  connectInjectedWallet,
  executeTransactionPlan,
  type EthereumProvider,
} from './wallet.js'

const account = '0x0000000000000000000000000000000000000010' as Address
const target = '0x0000000000000000000000000000000000000020' as Address
const hashA = `0x${'11'.repeat(32)}` as const
const hashB = `0x${'22'.repeat(32)}` as const

const bootstrap: FrontendBootstrap = {
  protocolName: 'ArcBook',
  protocolVersion: '1',
  mode: 'live',
  network: { chainId: 84_532, name: 'Base Sepolia', explorerUrl: 'https://sepolia.basescan.org', nativeCurrencySymbol: 'ETH' },
  deploymentBlock: 1,
  addresses: { aqua: null, swapVmRouter: null, curveKernel: null, liquidOBRouter: null, quoter: null, lens: null, batchExecutor: null },
  services: [{ name: 'rpc', health: 'healthy', url: 'https://rpc.test', message: 'ready' }],
  features: { marketExplorer: true, makerPreview: true, publishPosition: true, positionManagement: true, exactInputQuotes: true, exactOutputQuotes: true, executeRoutes: true, liveWrites: true },
  tokens: [],
  meta: { mode: 'live', source: 'composed', generatedAt: '2026-07-26T00:00:00.000Z', chainHeadBlock: 2, indexedBlock: 1, indexLag: 1, stale: false, warnings: [] },
}

function plan(from = account): TransactionPlan {
  return {
    id: 'plan',
    mode: 'live',
    action: 'execute',
    sendable: true,
    warnings: [],
    meta: bootstrap.meta,
    steps: [0, 1].map((order) => ({
      id: `step-${order}`,
      order,
      action: order === 0 ? 'approve-executor' : 'execute-route',
      title: `Step ${order}`,
      description: 'description',
      expectedEvent: 'Event',
      transaction: { chainId: 84_532, from, to: target, data: '0x', value: '0' },
    })),
  }
}

class Provider implements EthereumProvider {
  readonly calls: string[] = []
  chainId = '0x1'
  sends = 0

  async request(request: { method: string; params?: unknown[] }): Promise<unknown> {
    this.calls.push(request.method)
    if (request.method === 'eth_chainId') return this.chainId
    if (request.method === 'wallet_switchEthereumChain') {
      this.chainId = '0x14a34'
      return null
    }
    if (request.method === 'eth_requestAccounts' || request.method === 'eth_accounts') return [account]
    if (request.method === 'eth_sendTransaction') return this.sends++ === 0 ? hashA : hashB
    if (request.method === 'eth_getTransactionReceipt') return { status: '0x1' }
    throw new Error(`Unexpected ${request.method}`)
  }
}

afterEach(() => {
  delete window.ethereum
})

describe('injected wallet adapter', () => {
  it('switches to the deployment chain before returning an account', async () => {
    const provider = new Provider()
    window.ethereum = provider

    await expect(connectInjectedWallet(bootstrap)).resolves.toBe(account)
    expect(provider.calls).toEqual(['eth_chainId', 'wallet_switchEthereumChain', 'eth_requestAccounts'])
  })

  it('sends transaction steps sequentially and waits for each receipt', async () => {
    const provider = new Provider()
    provider.chainId = '0x14a34'
    window.ethereum = provider

    await expect(executeTransactionPlan(plan(), account, bootstrap)).resolves.toEqual([hashA, hashB])
    expect(provider.calls).toEqual([
      'eth_chainId',
      'eth_sendTransaction', 'eth_getTransactionReceipt',
      'eth_sendTransaction', 'eth_getTransactionReceipt',
    ])
  })

  it('refuses to send the same confirmed plan twice', async () => {
    const provider = new Provider()
    const transactionPlan = plan()
    provider.chainId = '0x14a34'
    window.ethereum = provider

    await executeTransactionPlan(transactionPlan, account, bootstrap)
    await expect(executeTransactionPlan(transactionPlan, account, bootstrap)).rejects.toThrow('already confirmed')
    expect(provider.sends).toBe(2)
  })

  it('rejects a plan created for a different signer', async () => {
    const provider = new Provider()
    provider.chainId = '0x14a34'
    window.ethereum = provider

    const other = '0x0000000000000000000000000000000000000099' as Address
    await expect(executeTransactionPlan(plan(other), account, bootstrap)).rejects.toThrow('does not own')
    expect(provider.calls).toEqual(['eth_chainId'])
  })
})
