import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'

import { afterAll, describe, expect, it, vi } from 'vitest'

const manifestPath = fileURLToPath(new URL('../../../../deployments/31337.json', import.meta.url))

vi.stubEnv('LIQUID_OB_MANIFEST', manifestPath)
vi.stubEnv('LIQUID_OB_ALLOW_LOCAL_MANIFEST', 'true')
vi.stubEnv('SOLVER_API_RPC_URL', 'https://rpc.example.invalid')
vi.stubEnv('SOLVER_API_SUBGRAPH_URL', 'https://graph.example.invalid')

const module = await import('../vercel.js')

afterAll(() => vi.unstubAllEnvs())

describe('Vercel solver adapter', () => {
  it('preserves query strings while removing the public prefix', () => {
    expect(module.solverPath('/api/solver/v1/markets?limit=3')).toBe('/v1/markets?limit=3')
  })

  it('serves Fastify routes through the serverless handler', async () => {
    const server = createServer((request, response) => {
      void module.default(request, response)
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('Expected an ephemeral TCP address')

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/solver/livez`)
      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({ status: 'alive' })
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  })
})
