import type {
  Address,
  FrontendBootstrap,
  PreparedTransaction,
  TransactionPlan,
  TransactionStep,
} from '@liquid-ob/frontend-api'

interface EthereumRequest {
  method: string
  params?: unknown[]
}

export interface EthereumProvider {
  request(request: EthereumRequest): Promise<unknown>
  on?(event: 'accountsChanged' | 'chainChanged', listener: (...args: unknown[]) => void): void
  removeListener?(event: 'accountsChanged' | 'chainChanged', listener: (...args: unknown[]) => void): void
}

export interface TransactionProgress {
  step: TransactionStep
  index: number
  total: number
  state: 'awaiting-signature' | 'confirming' | 'confirmed'
  transactionHash: `0x${string}` | null
}

export interface ConfirmedTransaction {
  hash: `0x${string}`
  blockNumber: number
}

declare global {
  interface Window {
    ethereum?: EthereumProvider
  }
}

export function injectedProvider(): EthereumProvider | null {
  return window.ethereum ?? null
}

export async function connectInjectedWallet(bootstrap: FrontendBootstrap): Promise<Address> {
  const provider = requireProvider()
  await ensureChain(provider, bootstrap)
  const accounts = await provider.request({ method: 'eth_requestAccounts' })
  const account = firstAddress(accounts)
  if (account === null) throw new Error('The wallet returned no account.')
  return account
}

export async function currentInjectedAccount(): Promise<Address | null> {
  const provider = injectedProvider()
  if (provider === null) return null
  return firstAddress(await provider.request({ method: 'eth_accounts' }))
}

export async function executeTransactionPlan(
  plan: TransactionPlan,
  account: Address,
  bootstrap: FrontendBootstrap,
  onProgress?: (progress: TransactionProgress) => void,
): Promise<ConfirmedTransaction[]> {
  if (!plan.sendable || plan.mode !== 'live') throw new Error('This transaction plan is not sendable.')
  const provider = requireProvider()
  await ensureChain(provider, bootstrap)
  const receipts: ConfirmedTransaction[] = []
  for (const [index, transactionStep] of plan.steps.entries()) {
    assertTransaction(transactionStep.transaction, account, bootstrap.network.chainId)
    onProgress?.({ step: transactionStep, index, total: plan.steps.length, state: 'awaiting-signature', transactionHash: null })
    const result = await provider.request({
      method: 'eth_sendTransaction',
      params: [rpcTransaction(transactionStep.transaction)],
    })
    const hash = transactionHash(result)
    onProgress?.({ step: transactionStep, index, total: plan.steps.length, state: 'confirming', transactionHash: hash })
    const blockNumber = await waitForReceipt(provider, hash)
    receipts.push({ hash, blockNumber })
    onProgress?.({ step: transactionStep, index, total: plan.steps.length, state: 'confirmed', transactionHash: hash })
  }
  return receipts
}

export function watchInjectedWallet(
  onAccount: (account: Address | null) => void,
  onChainChange: () => void,
): () => void {
  const provider = injectedProvider()
  if (provider?.on === undefined) return () => undefined
  const accountListener = (value: unknown) => onAccount(firstAddress(value))
  const chainListener = () => onChainChange()
  provider.on('accountsChanged', accountListener)
  provider.on('chainChanged', chainListener)
  return () => {
    provider.removeListener?.('accountsChanged', accountListener)
    provider.removeListener?.('chainChanged', chainListener)
  }
}

async function ensureChain(provider: EthereumProvider, bootstrap: FrontendBootstrap): Promise<void> {
  const expected = toQuantity(BigInt(bootstrap.network.chainId))
  const current = await provider.request({ method: 'eth_chainId' })
  if (typeof current === 'string' && current.toLowerCase() === expected.toLowerCase()) return
  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: expected }] })
  } catch (error) {
    if (!isUnknownChain(error)) throw error
    const rpcUrl = bootstrap.services.find((service) => service.name === 'rpc')?.url
    if (rpcUrl === null || rpcUrl === undefined) throw new Error(`Add chain ${bootstrap.network.name} to the wallet before continuing.`)
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: expected,
        chainName: bootstrap.network.name,
        nativeCurrency: {
          name: bootstrap.network.nativeCurrencySymbol,
          symbol: bootstrap.network.nativeCurrencySymbol,
          decimals: 18,
        },
        rpcUrls: [rpcUrl],
        ...(bootstrap.network.explorerUrl === null ? {} : { blockExplorerUrls: [bootstrap.network.explorerUrl] }),
      }],
    })
  }
}

async function waitForReceipt(provider: EthereumProvider, hash: `0x${string}`): Promise<number> {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    const value = await provider.request({ method: 'eth_getTransactionReceipt', params: [hash] })
    if (value !== null && typeof value === 'object') {
      const receipt = value as { status?: unknown; blockNumber?: unknown }
      const status = receipt.status
      if (status === '0x1' || status === '0x01') {
        if (typeof receipt.blockNumber !== 'string' || !/^0x[0-9a-fA-F]+$/.test(receipt.blockNumber)) {
          throw new Error(`Transaction ${hash} returned no valid receipt block.`)
        }
        const blockNumber = Number(BigInt(receipt.blockNumber))
        if (!Number.isSafeInteger(blockNumber)) {
          throw new Error(`Transaction ${hash} receipt block exceeds the supported range.`)
        }
        return blockNumber
      }
      if (status === '0x0' || status === '0x00') throw new Error(`Transaction ${hash} reverted.`)
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500))
  }
  throw new Error(`Timed out waiting for transaction ${hash}.`)
}

function rpcTransaction(transaction: PreparedTransaction) {
  return {
    from: transaction.from,
    to: transaction.to,
    data: transaction.data,
    value: toQuantity(BigInt(transaction.value)),
  }
}

function assertTransaction(transaction: PreparedTransaction, account: Address, chainId: number): void {
  if (transaction.chainId !== chainId) throw new Error('Transaction plan targets the wrong chain.')
  if (transaction.from.toLowerCase() !== account.toLowerCase()) throw new Error('Connected wallet does not own this transaction plan.')
}

function firstAddress(value: unknown): Address | null {
  if (!Array.isArray(value) || typeof value[0] !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(value[0])) return null
  return value[0] as Address
}

function transactionHash(value: unknown): `0x${string}` {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('Wallet returned an invalid transaction hash.')
  return value as `0x${string}`
}

function requireProvider(): EthereumProvider {
  const provider = injectedProvider()
  if (provider === null) throw new Error('No injected EVM wallet was found.')
  return provider
}

function toQuantity(value: bigint): `0x${string}` {
  return `0x${value.toString(16)}`
}

function isUnknownChain(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  return code === 4902 || code === -32603
}
