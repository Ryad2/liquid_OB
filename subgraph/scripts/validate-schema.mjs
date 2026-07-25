import { readFile } from 'node:fs/promises'

const schema = await readFile(new URL('../schema.graphql', import.meta.url), 'utf8')
const manifest = await readFile(new URL('../subgraph.yaml', import.meta.url), 'utf8')

for (const entity of ['Market', 'Maker', 'Position', 'CurveSide', 'Fill', 'Route', 'Token', 'MarketSnapshot']) {
  if (!schema.includes(`type ${entity} `)) throw new Error(`Missing ${entity} entity`)
}
for (const handler of ['handleShipped', 'handlePushed', 'handlePulled', 'handleDocked', 'handleCurveFilled', 'handleRouteExecuted']) {
  if (!manifest.includes(`handler: ${handler}`)) throw new Error(`Missing ${handler} handler`)
}
