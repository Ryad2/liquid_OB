import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const check = process.argv.includes('--check')
const entries = [
  ['contracts/out/Aqua.sol/Aqua.json', 'subgraph/abis/Aqua.json'],
  ['contracts/out/LiquidOBSwapVMRouter.sol/LiquidOBSwapVMRouter.json', 'subgraph/abis/Router.json'],
  ['contracts/out/LiquidOBBatchExecutor.sol/LiquidOBBatchExecutor.json', 'subgraph/abis/BatchExecutor.json'],
  ['contracts/out/IERC20Metadata.sol/IERC20Metadata.json', 'subgraph/abis/ERC20.json'],
]

for (const [artifactPath, outputPath] of entries) {
  const artifact = JSON.parse(await readFile(resolve(root, artifactPath), 'utf8'))
  const rendered = `${JSON.stringify(artifact.abi, null, 2)}\n`
  const target = resolve(root, outputPath)
  if (check) {
    const current = await readFile(target, 'utf8').catch(() => '')
    if (current !== rendered) throw new Error(`${outputPath} is stale; run pnpm --filter @liquid-ob/subgraph abi:sync`)
  } else {
    await writeFile(target, rendered)
  }
}
