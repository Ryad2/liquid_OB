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
const maker = privateKeyToAccount(privateKey(environment, 'MAKER_PRIVATE_KEY'))
const configuredAddress = environment.MAKER_ADDRESS
if (configuredAddress !== undefined && configuredAddress !== '' && getAddress(configuredAddress) !== maker.address) {
  throw new Error('MAKER_ADDRESS does not match MAKER_PRIVATE_KEY')
}
if (manifest.network?.chainId !== baseSepolia.id) throw new Error('Deployment manifest is not Base Sepolia')
const aqua = getAddress(manifest.contracts?.aqua?.address)
const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) })
const walletClient = createWalletClient({ account: maker, chain: baseSepolia, transport: http(rpcUrl) })
if (await publicClient.getChainId() !== baseSepolia.id) throw new Error('RPC is not Base Sepolia')
if (await publicClient.getCode({ address: aqua }) === undefined) throw new Error('Aqua has no code')

for (const entry of manifest.demoTokens ?? []) {
  const token = getAddress(entry.address)
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [maker.address] }),
    publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [maker.address, aqua] }),
  ])
  if (balance === 0n) throw new Error(`Maker has no ${entry.symbol ?? token}`)
  if (allowance === maxUint256) {
    console.log(`${entry.symbol ?? token} already approved for Aqua`)
    continue
  }
  const hash = await walletClient.writeContract({
    address: token,
    abi: erc20Abi,
    functionName: 'approve',
    args: [aqua, maxUint256],
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== 'success') throw new Error(`${entry.symbol ?? token} Aqua approval reverted`)
  console.log(`${entry.symbol ?? token} approved for demo Aqua settlement: ${hash}`)
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
