import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { describe, expect, it } from 'vitest'

import { createLiquidityMcpServer } from '../mcp-server.js'
import { ExecutableLiquidityService } from '../service.js'
import { FakeDex, FakeLiquidOB, MARKET_ID } from './fixtures.js'

describe('liquidity MCP protocol surface', () => {
  it('advertises and executes the four read-only tools', async () => {
    const server = createLiquidityMcpServer(new ExecutableLiquidityService(new FakeLiquidOB(), new FakeDex()))
    const client = new Client({ name: 'liquid-ob-test', version: '1.0.0' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    await server.connect(serverTransport)
    await client.connect(clientTransport)

    const tools = await client.listTools()
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      'discover_positions',
      'quote_arcbook',
      'build_candidate_route',
      'compare_executable_liquidity',
    ])
    const result = await client.callTool({
      name: 'discover_positions',
      arguments: { marketId: MARKET_ID, side: 'sell', limit: 10 },
    })
    expect(result.structuredContent).toMatchObject({ discoveredCount: 1, side: 'sell' })

    await client.close()
    await server.close()
  })
})
