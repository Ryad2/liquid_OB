import { WAD } from '@liquid-ob/curve-math'
import type { RouteCertificate, SolverCandidate } from '@liquid-ob/solver-core'
import { describe, expect, it, vi } from 'vitest'

import { RouteService } from '../service.js'
import type { ChainGateway, GraphGateway, IndexedMarketSnapshot } from '../types.js'
import { candidate, flat, market, prepared, request } from './fixtures.js'

function graph(snapshot: IndexedMarketSnapshot): GraphGateway {
  return {
    health: async () => ({
      indexedBlock: snapshot.indexedBlock,
      indexedBlockHash: snapshot.indexedBlockHash,
      indexingErrors: snapshot.indexingErrors,
    }),
    candidates: async () => snapshot,
  }
}

describe('RouteService', () => {
  it('shortlists from The Graph, refreshes through Lens, then solves again', async () => {
    const indexed = market([
      candidate(1, 'buy', flat(3n * WAD, 10n * WAD)),
      candidate(2, 'buy', flat(2n * WAD, 10n * WAD)),
    ])
    let finalCertificate: RouteCertificate | undefined
    const refreshCandidates = vi.fn(async (candidates: readonly SolverCandidate[]) => (
      candidates.map((entry) => entry.positionKey === indexed.candidates[0]!.positionKey
        ? { ...entry, active: false }
        : entry)
    ))
    const chain: ChainGateway = {
      health: async () => ({ chainId: 31_337, headBlock: 12n }),
      refreshCandidates,
      prepareRoute: async (_request, _market, certificate) => {
        finalCertificate = certificate
        return prepared(certificate)
      },
    }
    const service = new RouteService(graph(indexed), chain, {
      chainId: 31_337,
      maxFills: 8,
      reserveCount: 2,
      maxIndexLag: 5n,
    })

    await service.quote(request(), false)

    expect(refreshCandidates).toHaveBeenCalledOnce()
    expect(refreshCandidates.mock.calls[0]![0]).toHaveLength(2)
    expect(finalCertificate?.fills).toHaveLength(1)
    expect(finalCertificate?.fills[0]!.candidate.positionKey).toBe(indexed.candidates[1]!.positionKey)
  })

  it('fails closed when the Subgraph snapshot is stale', async () => {
    const indexed = market([candidate(1)], 10n)
    const chain: ChainGateway = {
      health: async () => ({ chainId: 31_337, headBlock: 20n }),
      refreshCandidates: async (candidates) => [...candidates],
      prepareRoute: async (_request, _market, certificate) => prepared(certificate),
    }
    const service = new RouteService(graph(indexed), chain, {
      chainId: 31_337,
      maxFills: 8,
      reserveCount: 2,
      maxIndexLag: 5n,
    })

    await expect(service.quote(request(), false)).rejects.toMatchObject({ code: 'SUBGRAPH_STALE' })
  })

  it('rejects an RPC connected to the wrong chain', async () => {
    const indexed = market([candidate(1)])
    const chain: ChainGateway = {
      health: async () => ({ chainId: 1, headBlock: 12n }),
      refreshCandidates: async (candidates) => [...candidates],
      prepareRoute: async (_request, _market, certificate) => prepared(certificate),
    }
    const service = new RouteService(graph(indexed), chain, {
      chainId: 31_337,
      maxFills: 8,
      reserveCount: 2,
      maxIndexLag: 5n,
    })

    await expect(service.quote(request({ amount: WAD }), false)).rejects.toMatchObject({ code: 'CHAIN_MISMATCH' })
  })
})
