import { describe, expect, it } from 'vitest'

import { parseDeploymentManifest } from './manifest.js'

const addresses = {
  aqua: '0x0000000000000000000000000000000000000001',
  curveKernel: '0x0000000000000000000000000000000000000002',
  router: '0x0000000000000000000000000000000000000003',
  quoter: '0x0000000000000000000000000000000000000004',
  lens: '0x0000000000000000000000000000000000000005',
  batchExecutor: '0x0000000000000000000000000000000000000006',
} as const

function fixture(): unknown {
  const contract = (address: string, source: string) => ({
    address,
    deploymentBlock: 10,
    transactionHash: `0x${'11'.repeat(32)}`,
    runtimeCodeHash: `0x${'22'.repeat(32)}`,
    source,
  })
  return {
    schemaVersion: 1,
    protocol: 'Liquid OB',
    protocolVersion: '1',
    network: {
      chainId: 84532,
      name: 'Base Sepolia',
      nativeCurrencySymbol: 'ETH',
      publicRpcUrl: 'https://example.invalid/rpc',
      explorerUrl: 'https://sepolia.basescan.org',
    },
    release: {
      public: true,
      deploymentBlock: 10,
      deploymentTransaction: `0x${'11'.repeat(32)}`,
      deployedAt: '2026-07-25T20:00:00.000Z',
      repository: 'https://github.com/Ryad2/liquid_OB',
      sourceCommit: '1234567890abcdef1234567890abcdef12345678',
    },
    config: { maxFills: 8, positionEncodingVersion: 1 },
    contracts: {
      aqua: contract(addresses.aqua, 'official-aqua-source'),
      curveKernel: contract(addresses.curveKernel, 'liquid-ob'),
      router: contract(addresses.router, 'liquid-ob'),
      quoter: contract(addresses.quoter, 'liquid-ob'),
      lens: contract(addresses.lens, 'liquid-ob'),
      batchExecutor: contract(addresses.batchExecutor, 'liquid-ob'),
    },
    demoTokens: [],
  }
}

describe('deployment manifest', () => {
  it('accepts and normalizes a complete public manifest', () => {
    const manifest = parseDeploymentManifest(fixture())
    expect(manifest.network.chainId).toBe(84_532)
    expect(manifest.contracts.router.address).toBe(addresses.router)
    expect(manifest.release.public).toBe(true)
  })

  it('rejects a wrong schema and unsafe max fills', () => {
    const wrongSchema = fixture() as Record<string, unknown>
    wrongSchema.schemaVersion = 2
    expect(() => parseDeploymentManifest(wrongSchema)).toThrow(/schemaVersion/)

    const wrongFills = fixture() as { config: { maxFills: number } }
    wrongFills.config.maxFills = 65_536
    expect(() => parseDeploymentManifest(wrongFills)).toThrow(/uint16/)
  })

  it('rejects duplicate addresses and incomplete public evidence', () => {
    const duplicate = fixture() as {
      contracts: { router: { address: string }; quoter: { address: string } }
    }
    duplicate.contracts.quoter.address = duplicate.contracts.router.address
    expect(() => parseDeploymentManifest(duplicate)).toThrow(/unique/)

    const noExplorer = fixture() as { network: { explorerUrl: string | null } }
    noExplorer.network.explorerUrl = null
    expect(() => parseDeploymentManifest(noExplorer)).toThrow(/Public manifests/)
  })
})
