import type { LiquidOBFrontendClient } from '@liquid-ob/frontend-api'
import { createMockLiquidOBClient } from '@liquid-ob/frontend-api/mock'
import { createLiveLiquidOBClient } from '@liquid-ob/frontend-live'

/**
 * The only composition root for protocol data in the web application.
 * UI components must never import mock fixtures, RPC clients, or ABIs directly.
 */
export function createProtocolClient(): LiquidOBFrontendClient {
  const mode = import.meta.env.VITE_PROTOCOL_MODE ?? 'mock'
  if (mode === 'mock') {
    return createMockLiquidOBClient({ latencyMs: 0 })
  }
  if (mode !== 'live') throw new Error(`Unsupported VITE_PROTOCOL_MODE=${mode}.`)
  const apiUrl = requiredEnvironment('VITE_SOLVER_URL', import.meta.env.VITE_SOLVER_URL)
  const manifestUrl = requiredEnvironment(
    'VITE_DEPLOYMENT_MANIFEST_URL',
    import.meta.env.VITE_DEPLOYMENT_MANIFEST_URL,
  )
  const rpcUrl = import.meta.env.VITE_PUBLIC_RPC_URL?.trim()
  return createLiveLiquidOBClient({
    apiUrl,
    manifestUrl,
    ...(rpcUrl === undefined || rpcUrl === '' ? {} : { rpcUrl }),
  })
}

function requiredEnvironment(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === '') throw new Error(`${name} is required in live mode.`)
  return value.trim()
}

export const protocolClient = createProtocolClient()
