import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const options = parseArgs(process.argv.slice(2))
const manifestPath = resolve(options.manifest ?? '../deployments/31337.json')
const sourcePath = resolve(options.source ?? 'subgraph.yaml')
const outputPath = resolve(options.out ?? 'subgraph.generated.yaml')
const network = options.network ?? 'anvil'
const deployment = JSON.parse(await readFile(manifestPath, 'utf8'))

const sources = {
  Aqua: deployment.contracts?.aqua,
  Router: deployment.contracts?.router,
  BatchExecutor: deployment.contracts?.batchExecutor,
}
for (const [name, contract] of Object.entries(sources)) {
  if (!contract?.address || !Number.isInteger(contract.deploymentBlock)) {
    throw new Error(`Deployment manifest is missing ${name}`)
  }
}

const lines = (await readFile(sourcePath, 'utf8')).split('\n')
let current = null
let insideRouterContext = false
const rendered = lines.map((line) => {
  const name = line.match(/^    name: (Aqua|Router|BatchExecutor)$/)?.[1]
  if (name) {
    current = name
    insideRouterContext = false
    return line
  }
  if (current && /^    network: /.test(line)) return `    network: ${network}`
  if (current && /^      address: /.test(line)) return `      address: "${sources[current].address}"`
  if (current && /^      startBlock: /.test(line)) return `      startBlock: ${sources[current].deploymentBlock}`
  if (current === 'Aqua' && /^      router:$/.test(line)) insideRouterContext = true
  if (insideRouterContext && /^        data: /.test(line)) {
    insideRouterContext = false
    return `        data: "${sources.Router.address}"`
  }
  return line
}).join('\n')

await writeFile(outputPath, rendered)
console.log(`Wrote ${outputPath} for ${network} at source commit ${deployment.release?.sourceCommit ?? 'unknown'}`)

function parseArgs(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]
    if (key === '--') continue
    if (!key?.startsWith('--')) throw new Error(`Unexpected argument ${key}`)
    const value = args[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`)
    parsed[key.slice(2)] = value
    index += 1
  }
  return parsed
}
