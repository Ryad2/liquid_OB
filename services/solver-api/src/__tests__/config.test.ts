import { readFile } from 'node:fs/promises'

import { describe, expect, it, vi } from 'vitest'

import { loadRuntimeConfig } from '../config.js'

async function publicManifest(): Promise<Record<string, unknown>> {
  const source = new URL('../../../../deployments/31337.json', import.meta.url)
  const manifest = JSON.parse(await readFile(source, 'utf8')) as {
    network: Record<string, unknown>
    release: Record<string, unknown>
  }
  manifest.network = {
    ...manifest.network,
    chainId: 84_532,
    name: 'Base Sepolia',
    publicRpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
  }
  manifest.release = { ...manifest.release, public: true }
  return manifest
}

function environment(): NodeJS.ProcessEnv {
  return {
    LIQUID_OB_MANIFEST_URL: 'https://example.com/deployments/84532.json',
    SOLVER_API_RPC_URL: 'https://sepolia.base.org',
    SOLVER_API_SUBGRAPH_URL: 'https://api.studio.thegraph.com/query/1/liquid-ob/version/latest',
  }
}

describe('runtime config', () => {
  it('loads and validates a public manifest over HTTPS', async () => {
    const manifest = await publicManifest()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(manifest))

    const config = await loadRuntimeConfig(environment(), fetcher)

    expect(config.manifest.network.chainId).toBe(84_532)
    expect(config.rpcUrl).toBe('https://sepolia.base.org')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('rejects non-HTTP manifest URLs before fetching', async () => {
    const fetcher = vi.fn<typeof fetch>()

    await expect(
      loadRuntimeConfig({ ...environment(), LIQUID_OB_MANIFEST_URL: 'file:///tmp/manifest.json' }, fetcher),
    ).rejects.toThrow(/HTTP\(S\)/)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects failed manifest responses', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }))

    await expect(loadRuntimeConfig(environment(), fetcher)).rejects.toThrow(/HTTP 404/)
  })
})
