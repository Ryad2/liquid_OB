import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

import { loadConfig } from './config.js'
import { startHttpServer } from './http.js'
import { LiquidOBApiClient } from './liquid-ob-client.js'
import { createLiquidityMcpServer } from './mcp-server.js'
import { ExecutableLiquidityService } from './service.js'
import { StandardDexGraphClient } from './standard-dex.js'

const config = loadConfig()
const service = new ExecutableLiquidityService(
  new LiquidOBApiClient({ baseUrl: config.liquidObApiUrl, timeoutMs: config.timeoutMs }),
  new StandardDexGraphClient({ ...config.standardDex, timeoutMs: config.timeoutMs }),
)

if (config.transport === 'stdio') {
  const server = createLiquidityMcpServer(service)
  await server.connect(new StdioServerTransport())
  process.once('SIGINT', () => void server.close().finally(() => process.exit(0)))
  process.once('SIGTERM', () => void server.close().finally(() => process.exit(0)))
} else {
  const server = await startHttpServer(service, config)
  process.stderr.write(`ArcBook liquidity MCP listening on http://${config.host}:${config.port}/mcp\n`)
  const shutdown = () => server.close(() => process.exit(0))
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}
