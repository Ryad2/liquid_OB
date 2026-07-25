import {
  getAddress,
  isAddress,
  keccak256,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'

export interface ContractDeployment {
  address: Address
  deploymentBlock: number | null
  transactionHash: Hex | null
  runtimeCodeHash: Hex
  source: 'liquid-ob' | 'official-aqua-source' | 'upstream'
}

export interface DemoTokenDeployment extends Omit<ContractDeployment, 'source'> {
  source: 'demo'
  role: 'base' | 'quote'
  symbol: string
  decimals: number
}

export interface DeploymentManifest {
  schemaVersion: 1
  protocol: 'Liquid OB'
  protocolVersion: '1'
  network: {
    chainId: number
    name: string
    nativeCurrencySymbol: string
    publicRpcUrl: string | null
    explorerUrl: string | null
  }
  release: {
    public: boolean
    deploymentBlock: number
    deploymentTransaction: Hex | null
    deployedAt: string
    repository: string
    sourceCommit: string
  }
  config: {
    maxFills: number
    positionEncodingVersion: 1
  }
  contracts: {
    aqua: ContractDeployment
    curveKernel: ContractDeployment
    router: ContractDeployment
    quoter: ContractDeployment
    lens: ContractDeployment
    batchExecutor: ContractDeployment
  }
  demoTokens: DemoTokenDeployment[]
}

export interface DeploymentManifestVerification {
  chainId: number
  checkedAtBlock: bigint
  runtimeCodeHashes: Record<string, Hex>
}

export function parseDeploymentManifest(input: unknown): DeploymentManifest {
  const root = record(input, 'manifest')
  exact(root.schemaVersion, 1, 'schemaVersion')
  exact(root.protocol, 'Liquid OB', 'protocol')
  exact(root.protocolVersion, '1', 'protocolVersion')

  const network = record(root.network, 'network')
  const chainId = positiveSafeInteger(network.chainId, 'network.chainId')
  const networkName = nonEmptyString(network.name, 'network.name')
  const nativeCurrencySymbol = nonEmptyString(
    network.nativeCurrencySymbol,
    'network.nativeCurrencySymbol',
  )
  const publicRpcUrl = nullableUrl(network.publicRpcUrl, 'network.publicRpcUrl')
  const explorerUrl = nullableUrl(network.explorerUrl, 'network.explorerUrl')

  const release = record(root.release, 'release')
  const isPublic = booleanValue(release.public, 'release.public')
  const deploymentBlock = nonNegativeSafeInteger(
    release.deploymentBlock,
    'release.deploymentBlock',
  )
  const deploymentTransaction = nullableHash(
    release.deploymentTransaction,
    'release.deploymentTransaction',
  )
  const deployedAt = isoDate(release.deployedAt, 'release.deployedAt')
  const repository = url(release.repository, 'release.repository')
  const sourceCommit = stringPattern(
    release.sourceCommit,
    /^[0-9a-f]{7,40}$/i,
    'release.sourceCommit',
  )
  if (isPublic && (deploymentBlock === 0 || deploymentTransaction === null || explorerUrl === null)) {
    throw new Error('Public manifests require a block, transaction, and explorer URL')
  }

  const config = record(root.config, 'config')
  const maxFills = positiveSafeInteger(config.maxFills, 'config.maxFills')
  if (maxFills > 65_535) throw new Error('config.maxFills exceeds uint16')
  exact(config.positionEncodingVersion, 1, 'config.positionEncodingVersion')

  const contracts = record(root.contracts, 'contracts')
  const aqua = contractDeployment(contracts.aqua, 'contracts.aqua', [
    'official-aqua-source',
    'upstream',
  ])
  const curveKernel = contractDeployment(
    contracts.curveKernel,
    'contracts.curveKernel',
    ['liquid-ob'],
  )
  const router = contractDeployment(contracts.router, 'contracts.router', ['liquid-ob'])
  const quoter = contractDeployment(contracts.quoter, 'contracts.quoter', ['liquid-ob'])
  const lens = contractDeployment(contracts.lens, 'contracts.lens', ['liquid-ob'])
  const batchExecutor = contractDeployment(
    contracts.batchExecutor,
    'contracts.batchExecutor',
    ['liquid-ob'],
  )
  assertUniqueAddresses([aqua, curveKernel, router, quoter, lens, batchExecutor])

  if (!Array.isArray(root.demoTokens)) throw new Error('demoTokens must be an array')
  const demoTokens = root.demoTokens.map((value, index) => demoToken(value, index))
  assertUniqueAddresses([...demoTokens, aqua, curveKernel, router, quoter, lens, batchExecutor])

  return {
    schemaVersion: 1,
    protocol: 'Liquid OB',
    protocolVersion: '1',
    network: {
      chainId,
      name: networkName,
      nativeCurrencySymbol,
      publicRpcUrl,
      explorerUrl,
    },
    release: {
      public: isPublic,
      deploymentBlock,
      deploymentTransaction,
      deployedAt,
      repository,
      sourceCommit,
    },
    config: { maxFills, positionEncodingVersion: 1 },
    contracts: { aqua, curveKernel, router, quoter, lens, batchExecutor },
    demoTokens,
  }
}

export async function fetchDeploymentManifest(urlValue: string): Promise<DeploymentManifest> {
  const response = await fetch(urlValue, { headers: { accept: 'application/json' } })
  if (!response.ok) throw new Error(`Deployment manifest request failed: ${response.status}`)
  return parseDeploymentManifest(await response.json())
}

export function assertManifestChain(manifest: DeploymentManifest, chainId: number): void {
  if (manifest.network.chainId !== chainId) {
    throw new Error(`Manifest chain ${manifest.network.chainId} does not match wallet chain ${chainId}`)
  }
}

export async function verifyDeploymentBytecode(
  client: PublicClient,
  manifest: DeploymentManifest,
): Promise<DeploymentManifestVerification> {
  const chainId = await client.getChainId()
  assertManifestChain(manifest, chainId)
  const contracts: Record<string, ContractDeployment | DemoTokenDeployment> = {
    ...manifest.contracts,
  }
  for (const token of manifest.demoTokens) contracts[`demo-${token.role}`] = token

  const runtimeCodeHashes: Record<string, Hex> = {}
  for (const [name, deployment] of Object.entries(contracts)) {
    const bytecode = await client.getBytecode({ address: deployment.address })
    if (bytecode === undefined || bytecode === '0x') throw new Error(`${name} has no runtime bytecode`)
    const actualHash = keccak256(bytecode)
    if (actualHash.toLowerCase() !== deployment.runtimeCodeHash.toLowerCase()) {
      throw new Error(`${name} runtime bytecode hash mismatch`)
    }
    runtimeCodeHashes[name] = actualHash
  }

  return {
    chainId,
    checkedAtBlock: await client.getBlockNumber(),
    runtimeCodeHashes,
  }
}

function contractDeployment(
  value: unknown,
  path: string,
  allowedSources: ContractDeployment['source'][],
): ContractDeployment {
  const item = record(value, path)
  const source = nonEmptyString(item.source, `${path}.source`) as ContractDeployment['source']
  if (!allowedSources.includes(source)) throw new Error(`${path}.source is not allowed`)
  return {
    address: address(item.address, `${path}.address`),
    deploymentBlock: nullableBlock(item.deploymentBlock, `${path}.deploymentBlock`),
    transactionHash: nullableHash(item.transactionHash, `${path}.transactionHash`),
    runtimeCodeHash: hash(item.runtimeCodeHash, `${path}.runtimeCodeHash`),
    source,
  }
}

function demoToken(value: unknown, index: number): DemoTokenDeployment {
  const path = `demoTokens[${index}]`
  const item = record(value, path)
  exact(item.source, 'demo', `${path}.source`)
  const role = nonEmptyString(item.role, `${path}.role`)
  if (role !== 'base' && role !== 'quote') throw new Error(`${path}.role is invalid`)
  const decimals = nonNegativeSafeInteger(item.decimals, `${path}.decimals`)
  if (decimals > 18) throw new Error(`${path}.decimals exceeds 18`)
  return {
    address: address(item.address, `${path}.address`),
    deploymentBlock: nullableBlock(item.deploymentBlock, `${path}.deploymentBlock`),
    transactionHash: nullableHash(item.transactionHash, `${path}.transactionHash`),
    runtimeCodeHash: hash(item.runtimeCodeHash, `${path}.runtimeCodeHash`),
    source: 'demo',
    role,
    symbol: nonEmptyString(item.symbol, `${path}.symbol`),
    decimals,
  }
}

function assertUniqueAddresses(items: Array<ContractDeployment | DemoTokenDeployment>): void {
  const values = items.map((item) => item.address.toLowerCase())
  if (new Set(values).size !== values.length) throw new Error('Manifest contract addresses must be unique')
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`)
  }
  return value as Record<string, unknown>
}

function exact<T extends string | number>(value: unknown, expected: T, path: string): T {
  if (value !== expected) throw new Error(`${path} must equal ${expected}`)
  return expected
}

function nonEmptyString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${path} must be a string`)
  return value
}

function stringPattern(value: unknown, pattern: RegExp, path: string): string {
  const result = nonEmptyString(value, path)
  if (!pattern.test(result)) throw new Error(`${path} has an invalid format`)
  return result
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${path} must be boolean`)
  return value
}

function nonNegativeSafeInteger(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${path} must be a non-negative safe integer`)
  }
  return value
}

function positiveSafeInteger(value: unknown, path: string): number {
  const result = nonNegativeSafeInteger(value, path)
  if (result === 0) throw new Error(`${path} must be positive`)
  return result
}

function nullableBlock(value: unknown, path: string): number | null {
  return value === null ? null : nonNegativeSafeInteger(value, path)
}

function address(value: unknown, path: string): Address {
  if (typeof value !== 'string' || !isAddress(value) || /^0x0{40}$/i.test(value)) {
    throw new Error(`${path} must be a non-zero EVM address`)
  }
  return getAddress(value)
}

function hash(value: unknown, path: string): Hex {
  return stringPattern(value, /^0x[0-9a-f]{64}$/i, path) as Hex
}

function nullableHash(value: unknown, path: string): Hex | null {
  return value === null ? null : hash(value, path)
}

function url(value: unknown, path: string): string {
  const result = nonEmptyString(value, path)
  const parsed = new URL(result)
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`${path} must use http or https`)
  }
  return result
}

function nullableUrl(value: unknown, path: string): string | null {
  return value === null ? null : url(value, path)
}

function isoDate(value: unknown, path: string): string {
  const result = nonEmptyString(value, path)
  if (Number.isNaN(Date.parse(result))) throw new Error(`${path} must be an ISO date`)
  return result
}
