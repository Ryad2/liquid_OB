const appUrl = publicUrl(required('PUBLIC_APP_URL'), 'PUBLIC_APP_URL')
const apiUrl = publicUrl(required('PUBLIC_API_URL'), 'PUBLIC_API_URL')
const manifestUrl = publicUrl(required('PUBLIC_MANIFEST_URL'), 'PUBLIC_MANIFEST_URL')
const mcpUrl = publicUrl(required('PUBLIC_MCP_URL'), 'PUBLIC_MCP_URL')
const subgraphUrl = publicUrl(required('PUBLIC_SUBGRAPH_URL'), 'PUBLIC_SUBGRAPH_URL')
const rpcUrl = publicUrl(required('PUBLIC_RPC_URL'), 'PUBLIC_RPC_URL')

const appResponse = await request(appUrl, { headers: { accept: 'text/html' } })
const appHtml = await appResponse.text()
if (!/arcbook/i.test(appHtml)) throw new Error('Public app does not identify ArcBook')
if (!appResponse.headers.get('content-security-policy')) throw new Error('Public app has no Content-Security-Policy')

const manifest = await json(manifestUrl)
if (manifest.release?.public !== true) throw new Error('Deployment manifest is not marked public')
if (!Number.isSafeInteger(manifest.network?.chainId)) throw new Error('Manifest chain id is invalid')
publicUrl(manifest.network.publicRpcUrl, 'manifest.network.publicRpcUrl')
publicUrl(manifest.network.explorerUrl, 'manifest.network.explorerUrl')

const ready = await json(`${apiUrl}/readyz`)
if (ready.status !== 'ready') throw new Error('Solver API is not ready')
const health = await json(`${apiUrl}/v1/health`)
if (health.status !== 'healthy') throw new Error(`Solver health is ${health.status ?? 'unknown'}`)
const bootstrap = await json(`${apiUrl}/v1/bootstrap`, { headers: { origin: new URL(appUrl).origin } })
if (bootstrap.mode !== 'live' || bootstrap.meta?.stale || bootstrap.features?.liveWrites !== true) {
  throw new Error('Frontend bootstrap is not a fresh writable live release')
}
if (bootstrap.network?.chainId !== manifest.network.chainId) throw new Error('API and manifest chain IDs differ')
const addressPairs = [
  ['aqua', 'aqua'],
  ['curveKernel', 'curveKernel'],
  ['liquidOBRouter', 'router'],
  ['quoter', 'quoter'],
  ['lens', 'lens'],
  ['batchExecutor', 'batchExecutor'],
]
for (const [bootstrapKey, manifestKey] of addressPairs) {
  if (lower(bootstrap.addresses?.[bootstrapKey]) !== lower(manifest.contracts?.[manifestKey]?.address)) {
    throw new Error(`API and manifest disagree on ${bootstrapKey}`)
  }
}

const markets = await json(`${apiUrl}/v1/markets?limit=100`)
if (!Array.isArray(markets.items) || markets.items.length === 0) throw new Error('No public market is indexed')
const market = markets.items[0]
const positions = await json(`${apiUrl}/v1/positions?marketId=${market.id}&lifecycle=active&limit=100`)
if (!Array.isArray(positions.items) || positions.items.length < 3) throw new Error('Public demo requires at least three active positions')
if (positions.items.some((position) => position.sufficientlyBacked !== true)) throw new Error('A public demo position is under-backed')
const activity = await json(`${apiUrl}/v1/activity?marketId=${market.id}&limit=100`)
if (!Array.isArray(activity.items) || !activity.items.some((item) => item.type === 'route-executed')) {
  throw new Error('Public demo has no indexed route execution')
}

const mcpReady = await json(`${mcpUrl}/readyz`)
if (mcpReady.status !== 'ready') throw new Error('Executable Liquidity MCP is not ready')
const mcpInitialize = await json(`${mcpUrl}/mcp`, {
  method: 'POST',
  headers: {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-protocol-version': '2025-11-25',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'release-gate',
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'liquid-ob-release-gate', version: '1.0.0' },
    },
  }),
})
if (mcpInitialize.result?.serverInfo?.name !== 'arcbook-executable-liquidity') {
  throw new Error('Public MCP endpoint returned an unexpected server identity')
}
const mcpDiscovery = await json(`${mcpUrl}/mcp`, {
  method: 'POST',
  headers: {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-protocol-version': '2025-11-25',
  },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 'release-gate-discovery',
    method: 'tools/call',
    params: {
      name: 'discover_positions',
      arguments: { marketId: market.id, side: 'sell', limit: 3 },
    },
  }),
})
if (mcpDiscovery.result?.structuredContent?.discoveredCount < 1) {
  throw new Error('Public MCP endpoint did not discover an active sell position')
}

const graph = await json(subgraphUrl, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    query: 'query ReleaseGate { _meta { block { number hash } hasIndexingErrors } positions(first: 3, where: { active: true }) { id sufficientlyAllocated sides(first: 2) { id active } } }',
  }),
})
if (Array.isArray(graph.errors) && graph.errors.length > 0) throw new Error(`Subgraph query failed: ${graph.errors[0]?.message ?? 'unknown error'}`)
if (graph.data?._meta?.hasIndexingErrors || graph.data?.positions?.length < 3) throw new Error('Subgraph release gate failed')

const rpcChain = await rpc('eth_chainId', [])
if (Number.parseInt(rpcChain, 16) !== manifest.network.chainId) throw new Error('Public RPC chain differs from manifest')
const bytecodeEntries = {
  ...(manifest.contracts ?? {}),
  ...Object.fromEntries((manifest.demoTokens ?? []).map((token) => [`demo-${token.role}`, token])),
}
for (const [name, contract] of Object.entries(bytecodeEntries)) {
  if (await rpc('eth_getCode', [contract.address, 'latest']) === '0x') throw new Error(`${name} has no public runtime bytecode`)
}

process.stdout.write(`${JSON.stringify({
  status: 'public-demo-ready',
  app: appUrl,
  api: apiUrl,
  mcp: mcpUrl,
  chainId: manifest.network.chainId,
  markets: markets.items.length,
  activePositions: positions.items.length,
  indexedBlock: bootstrap.meta.indexedBlock,
}, null, 2)}\n`)

async function rpc(method, params) {
  const payload = await json(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  if (payload.error) throw new Error(`RPC ${method}: ${payload.error.message ?? 'unknown error'}`)
  return payload.result
}

async function json(url, init = {}) {
  const response = await request(url, { ...init, headers: { accept: 'application/json', ...init.headers } })
  try {
    return await response.json()
  } catch {
    throw new Error(`${url} returned invalid JSON`)
  }
}

async function request(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`)
  return response
}

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function publicUrl(value, label) {
  const url = new URL(value)
  if (url.protocol !== 'https:') throw new Error(`${label} must use HTTPS`)
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '0.0.0.0' || host === '::' || host === '::1'
    || host.endsWith('.local') || host.endsWith('.internal') || /^127\./.test(host)
    || /^10\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)
    || private172(host) || /^(?:fc|fd|fe[89ab])/i.test(host)) {
    throw new Error(`${label} cannot target a local or private host`)
  }
  return url.toString().replace(/\/$/, '')
}

function private172(host) {
  const match = host.match(/^172\.(\d+)\./)
  return match !== null && Number(match[1]) >= 16 && Number(match[1]) <= 31
}

function lower(value) {
  return typeof value === 'string' ? value.toLowerCase() : ''
}
