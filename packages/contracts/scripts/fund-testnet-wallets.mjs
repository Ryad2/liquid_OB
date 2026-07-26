import { readFile } from 'node:fs/promises'

import {
  createPublicClient,
  createWalletClient,
  formatEther,
  getAddress,
  http,
  parseEther,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { baseSepolia } from 'viem/chains'

const envUrl = new URL('../../../.env', import.meta.url)
const environment = parseEnvironment(await readFile(envUrl, 'utf8'))
const rpcUrl = required(environment, 'BASE_SEPOLIA_RPC_URL')
const deployer = privateKeyToAccount(privateKey(environment, 'DEPLOYER_PRIVATE_KEY'))
const roles = [
  ['maker', privateKeyToAccount(privateKey(environment, 'MAKER_PRIVATE_KEY')), environment.MAKER_ADDRESS],
  ['taker', privateKeyToAccount(privateKey(environment, 'TAKER_PRIVATE_KEY')), environment.TAKER_ADDRESS],
]
const targetBalance = parseEther(argument('--target') ?? '0.002')
if (targetBalance <= 0n) throw new Error('--target must be a positive ETH amount')

const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) })
const walletClient = createWalletClient({ account: deployer, chain: baseSepolia, transport: http(rpcUrl) })
const chainId = await publicClient.getChainId()
if (chainId !== baseSepolia.id) {
  throw new Error(`RPC chain ${chainId} does not match Base Sepolia ${baseSepolia.id}`)
}

for (const [name, account, configuredAddress] of roles) {
  if (configuredAddress !== undefined && configuredAddress !== ''
    && getAddress(configuredAddress) !== account.address) {
    throw new Error(`${name.toUpperCase()}_ADDRESS does not match its private key`)
  }
  const balance = await publicClient.getBalance({ address: account.address })
  if (balance >= targetBalance) {
    console.log(`${name} ${account.address} already has ${formatEther(balance)} ETH`)
    continue
  }
  const value = targetBalance - balance
  const deployerBalance = await publicClient.getBalance({ address: deployer.address })
  if (deployerBalance <= value) throw new Error('Deployer balance cannot cover role funding and gas')
  const hash = await walletClient.sendTransaction({ to: account.address, value })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${name} funding transaction reverted`)
  console.log(`${name} ${account.address} funded to ${formatEther(targetBalance)} ETH: ${hash}`)
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

function argument(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) throw new Error(`${name} requires a value`)
  return value
}
