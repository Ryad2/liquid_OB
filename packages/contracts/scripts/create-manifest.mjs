import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { getAddress, isAddress, keccak256 } from 'viem'

const args = parseArgs(process.argv.slice(2))
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const required = (name) => {
  const value = args.get(name)
  if (value === undefined || value === '') throw new Error(`Missing --${name}`)
  return value
}

const broadcastPath = resolve(repositoryRoot, required('broadcast'))
const rpcUrl = required('rpc-url')
const expectedChainId = Number(required('chain-id'))
const networkName = required('network-name')
const outputPath = resolve(repositoryRoot, required('out'))
const isPublic = parseBoolean(args.get('public') ?? 'false')
const explorerUrl = optionalUrl(args.get('explorer-url'))
const publicRpcUrl = optionalUrl(args.get('public-rpc-url'))
const maxFills = Number(args.get('max-fills') ?? '8')
if (!Number.isSafeInteger(expectedChainId) || expectedChainId <= 0) throw new Error('Invalid chain id')
if (!Number.isSafeInteger(maxFills) || maxFills <= 0 || maxFills > 65_535) {
  throw new Error('Invalid max fills')
}

const rpcChainId = Number.parseInt(await rpc('eth_chainId', []), 16)
if (rpcChainId !== expectedChainId) {
  throw new Error(`RPC chain ${rpcChainId} does not match requested chain ${expectedChainId}`)
}

const broadcast = JSON.parse(await readFile(broadcastPath, 'utf8'))
const transactions = Array.isArray(broadcast.transactions) ? broadcast.transactions : []
const receipts = Array.isArray(broadcast.receipts) ? broadcast.receipts : []
const receiptByHash = new Map(
  receipts.map((receipt) => [String(receipt.transactionHash).toLowerCase(), receipt]),
)

function deploymentsFor(contractName) {
  return transactions.filter(
    (transaction) => transaction.contractName === contractName && isAddress(transaction.contractAddress),
  )
}

function oneDeployment(contractName) {
  const matches = deploymentsFor(contractName)
  if (matches.length !== 1) {
    throw new Error(`Expected one ${contractName} deployment, found ${matches.length}`)
  }
  return matches[0]
}

async function deployedEntry(transaction, source) {
  const address = getAddress(transaction.contractAddress)
  const transactionHash = transaction.hash
  const receipt = receiptByHash.get(String(transactionHash).toLowerCase())
  if (receipt === undefined) throw new Error(`Missing receipt for ${transactionHash}`)
  return {
    address,
    deploymentBlock: Number.parseInt(receipt.blockNumber, 16),
    transactionHash,
    runtimeCodeHash: await runtimeCodeHash(address),
    source,
  }
}

const routerTransaction = oneDeployment('LiquidOBSwapVMRouter')
const router = await deployedEntry(routerTransaction, 'liquid-ob')
const curveKernel = await deployedEntry(oneDeployment('LiquidOBCurveKernel'), 'liquid-ob')
const quoter = await deployedEntry(oneDeployment('LiquidOBQuoter'), 'liquid-ob')
const lens = await deployedEntry(oneDeployment('LiquidOBLens'), 'liquid-ob')
const batchExecutor = await deployedEntry(oneDeployment('LiquidOBBatchExecutor'), 'liquid-ob')
const aquaDeployments = deploymentsFor('Aqua')
let aqua
if (aquaDeployments.length === 1) {
  aqua = await deployedEntry(aquaDeployments[0], 'official-aqua-source')
} else if (aquaDeployments.length === 0) {
  const aquaAddress = required('aqua')
  if (!isAddress(aquaAddress)) throw new Error('--aqua must be an address')
  const address = getAddress(aquaAddress)
  aqua = {
    address,
    deploymentBlock: null,
    transactionHash: null,
    runtimeCodeHash: await runtimeCodeHash(address),
    source: 'upstream',
  }
} else {
  throw new Error(`Expected at most one Aqua deployment, found ${aquaDeployments.length}`)
}

const tokenDeployments = deploymentsFor('LiquidOBDemoToken')
if (tokenDeployments.length !== 0 && tokenDeployments.length !== 2) {
  throw new Error(`Expected zero or two demo tokens, found ${tokenDeployments.length}`)
}
const tokenMetadata = [
  { role: 'base', symbol: 'dETH', decimals: 18 },
  { role: 'quote', symbol: 'dUSD', decimals: 18 },
]
const demoTokens = []
for (let index = 0; index < tokenDeployments.length; index += 1) {
  demoTokens.push({
    ...(await deployedEntry(tokenDeployments[index], 'demo')),
    ...tokenMetadata[index],
  })
}

const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: repositoryRoot,
  encoding: 'utf8',
}).trim()
const deploymentBlocks = [curveKernel, router, quoter, lens, batchExecutor]
  .map((item) => item.deploymentBlock)
  .filter((value) => value !== null)
const deploymentBlock = Math.min(...deploymentBlocks)
const manifest = {
  schemaVersion: 1,
  protocol: 'ArcBook',
  protocolVersion: '1',
  network: {
    chainId: expectedChainId,
    name: networkName,
    nativeCurrencySymbol: args.get('native-symbol') ?? 'ETH',
    publicRpcUrl,
    explorerUrl,
  },
  release: {
    public: isPublic,
    deploymentBlock,
    deploymentTransaction: router.transactionHash,
    deployedAt: new Date().toISOString(),
    repository: args.get('repository') ?? 'https://github.com/Ryad2/liquid_OB',
    sourceCommit,
  },
  config: {
    maxFills,
    positionEncodingVersion: 1,
  },
  contracts: { aqua, curveKernel, router, quoter, lens, batchExecutor },
  demoTokens,
}

if (isPublic && (explorerUrl === null || router.transactionHash === null)) {
  throw new Error('Public manifests require explorer and transaction evidence')
}
await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`)
process.stdout.write(`${outputPath}\n`)

async function runtimeCodeHash(address) {
  const code = await rpc('eth_getCode', [address, 'latest'])
  if (code === '0x') throw new Error(`${address} has no runtime bytecode`)
  return keccak256(code)
}

async function rpc(method, params) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (!response.ok) throw new Error(`RPC ${method} failed with HTTP ${response.status}`)
  const payload = await response.json()
  if (payload.error !== undefined) throw new Error(`RPC ${method}: ${payload.error.message}`)
  return payload.result
}

function parseArgs(values) {
  if (values[0] === '--') values = values.slice(1)
  const result = new Map()
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]
    const value = values[index + 1]
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument ${key ?? ''}`)
    result.set(key.slice(2), value)
  }
  return result
}

function parseBoolean(value) {
  if (value === 'true') return true
  if (value === 'false') return false
  throw new Error('--public must be true or false')
}

function optionalUrl(value) {
  if (value === undefined || value === '') return null
  const parsed = new URL(value)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Unsupported URL protocol: ${parsed.protocol}`)
  }
  return value
}
