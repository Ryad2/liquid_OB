import { describe, expect, it } from 'vitest'
import { LiveLiquidOBClient } from '@liquid-ob/frontend-live'

import { createProtocolClient } from './client'

describe('ArcBook protocol composition', () => {
  it('keeps local development deterministic when no mode is configured', async () => {
    const client = createProtocolClient({ DEV: true, PROD: false })
    await expect(client.getBootstrap()).resolves.toMatchObject({ mode: 'mock' })
  })

  it('refuses to publish a production build backed by mock data', () => {
    expect(() => createProtocolClient({ PROD: true, VITE_PROTOCOL_MODE: 'mock' })).toThrow(
      /production builds cannot run.*mock/i,
    )
  })

  it('defaults production to live and requires public endpoints', () => {
    expect(() => createProtocolClient({ PROD: true })).toThrow(/VITE_SOLVER_URL is required/)
  })

  it('creates the live adapter only with complete endpoint configuration', () => {
    const client = createProtocolClient({
      PROD: true,
      VITE_PROTOCOL_MODE: 'live',
      VITE_SOLVER_URL: 'https://arcbook.example/api/solver',
      VITE_DEPLOYMENT_MANIFEST_URL: 'https://arcbook.example/deployments/84532.json',
      VITE_PUBLIC_RPC_URL: 'https://sepolia.base.org',
    })
    expect(client).toBeInstanceOf(LiveLiquidOBClient)
  })
})
