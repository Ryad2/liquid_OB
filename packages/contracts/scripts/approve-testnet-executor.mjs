import { readFile } from 'node:fs/promises'

import {
  createPublicClient,
  createWalletClient,
  erc20Abi,
  getAddress,
  http,
  maxUint256,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const environment = parseEnvironment(await readFile(new URL('../../../.env', import.meta.url), 'utf8'))
const manifest = JSON.parse(await readFile(new URL('../../../deployments/84532.json', import.meta.url), 'utf8'))
const rpcUrl = required(environment, 'BASE_SEPOLIA_RPC_URL')
const taker = privateKeyToAccount(privateKey(environment, 'TAKER_PRIVATE_KEY'))
const configuredAddress = environment.TAKER_ADDRESS
if (configuredAddress !== undefined && configuredAddress !== '' && getAddress(configuredAddress) !== taker.address) {
  throw new Error('TAKER_ADDRESS does not match TAKER_PRIVATE_KEY')
}
if (manifest.network?.chainId !== baseSepolia.id) throw new Error('Deployment manifest is not Base Sepolia')
const executor = getAddress(manifest.contracts?.batchExecutor?.address)
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) })
const walletClient = createWalletClient({ account: taker, chain: baseSepolia, transport: http(rpcUrl) })
if (await publicClient.getChainId() !== baseSepolia.id) throw new Error('RPC is not Base Sepolia')
if (await publicClient.getCode({ address: executor }) === undefined) throw new Error('BatchExecutor has no code')

for (const entry of manifest.demoTokens ?? []) {
  const token = getAddress(entry.address)
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [taker.address] }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [taker.address, executor] }),
  ])
  if (balance === 0n) throw new Error(`Taker has no ${entry.symbol ?? token}`)
  if (allowance === maxUint256) {
    console.log(`${entry.symbol ?? token} already approved for ${executor}`)
    continue
  }
  const hash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [executor, maxUint256],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${entry.symbol ?? token} approval reverted`)
  console.log(`${entry.symbol ?? token} approved for the demo BatchExecutor: ${hash}`)
}

function parseEnvironment(source) {
  return Object.fromEntries(source.split(/\r?\n/u).flatMap((line) => {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u)
    if (match === null) return []
    const value = match[2].trim().replace(/^(?:"(.*)"|'(.*)')$/u, '$1$2')
    return [[match[1], value]]
  }))
}

function required(environmentValues, name) {
  const value = environmentValues[name]
  if (value === undefined || value === '') throw new Error(`${name} is required in .env`)
  return value
}

function privateKey(environmentValues, name) {
  const value = required(environmentValues, name)
  if (!/^0x[0-9a-fA-F]{64}$/u.test(value)) throw new Error(`${name} is not a private key`)
  return value
}
