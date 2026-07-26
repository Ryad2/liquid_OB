import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createPublicClient, http, keccak256 } from 'viem'

const options = argumentsMap(process.argv.slice(2))
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const manifestPath = resolve(repositoryRoot, required(options, 'manifest'))
const rpcUrl = required(options, 'rpc-url')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const client = createPublicClient({ transport: http(rpcUrl, { timeout: 12_000, retryCount: 2 }) })

if (await client.getChainId() !== manifest.network?.chainId) throw new Error('RPC chain does not match manifest')
const deployments = { ...manifest.contracts }
for (const token of manifest.demoTokens ?? []) deployments[`demo-${token.role}`] = token
for (const [name, deployment] of Object.entries(deployments)) {
  const code = await client.getBytecode({ address: deployment.address })
  if (code === undefined || code === '0x') throw new Error(`${name} has no runtime bytecode`)
  if (keccak256(code).toLowerCase() !== String(deployment.runtimeCodeHash).toLowerCase()) {
    throw new Error(`${name} runtime bytecode hash differs from manifest`)
  }
}

const links = [
  ['router.AQUA', manifest.contracts.router.address, 'AQUA', manifest.contracts.aqua.address],
  ['router.CURVE_KERNEL', manifest.contracts.router.address, 'CURVE_KERNEL', manifest.contracts.curveKernel.address],
  ['quoter.ROUTER', manifest.contracts.quoter.address, 'ROUTER', manifest.contracts.router.address],
  ['lens.ROUTER', manifest.contracts.lens.address, 'ROUTER', manifest.contracts.router.address],
  ['lens.AQUA', manifest.contracts.lens.address, 'AQUA', manifest.contracts.aqua.address],
  ['batchExecutor.ROUTER', manifest.contracts.batchExecutor.address, 'ROUTER', manifest.contracts.router.address],
]
for (const [label, address, functionName, expected] of links) {
  const actual = await client.readContract({
    address,
    abi: [{ type: 'function', name: functionName, stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] }],
    functionName,
  })
  if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`${label} link mismatch`)
}
const maxFills = await client.readContract({
  address: manifest.contracts.batchExecutor.address,
  abi: [{ type: 'function', name: 'MAX_FILLS', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint16' }] }],
  functionName: 'MAX_FILLS',
})
if (Number(maxFills) !== manifest.config?.maxFills) throw new Error('MAX_FILLS differs from manifest')

process.stdout.write(`${JSON.stringify({
  status: 'verified',
  chainId: manifest.network.chainId,
  contracts: Object.keys(deployments).length,
  sourceCommit: manifest.release?.sourceCommit,
}, null, 2)}\n`)

function argumentsMap(values) {
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

function required(values, name) {
  const value = values.get(name)
  if (value === undefined || value === '') throw new Error(`Missing --${name}`)
  return value
}
