import { createServer } from 'node:http'

import { afterAll, describe, expect, it, vi } from 'vitest'

vi.stubEnv('LIQUIDITY_MCP_TRANSPORT', 'http')
vi.stubEnv('LIQUID_OB_API_URL', 'https://api.example.invalid/api/solver')

const module = await import('../vercel.js')

afterAll(() => vi.unstubAllEnvs())

describe('Vercel MCP adapter', () => {
  it('preserves query strings while removing the public prefix', () => {
    expect(module.mcpPath('/api/mcp/mcp?session=demo')).toBe('/mcp?session=demo')
  })

  it('restores paths forwarded by the Vercel rewrite', () => {
    expect(module.mcpPath('/api/mcp-handler?__mcp_path=healthz')).toBe('/healthz')
  })

  it('serves the MCP health route through the serverless handler', async () => {
    const server = createServer((request, response) => {
      void module.default(request, response)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Expected an ephemeral TCP address')

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/mcp/healthz`)
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ status: 'alive' })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  })
})
