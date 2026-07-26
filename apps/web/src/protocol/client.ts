import type { LiquidOBFrontendClient } from '@liquid-ob/frontend-api'
import { createMockLiquidOBClient } from '@liquid-ob/frontend-api/mock'
import { createLiveLiquidOBClient } from '@liquid-ob/frontend-live'

interface ProtocolEnvironment {
  readonly DEV?: boolean
  readonly PROD?: boolean
  readonly VITE_PROTOCOL_MODE?: string
  readonly VITE_SOLVER_URL?: string
  readonly VITE_DEPLOYMENT_MANIFEST_URL?: string
  readonly VITE_PUBLIC_RPC_URL?: string
}

/**
 * The only composition root for protocol data in the web application.
 * UI components must never import mock fixtures, RPC clients, or ABIs directly.
 */
export function createProtocolClient(
  environment: ProtocolEnvironment = import.meta.env,
): LiquidOBFrontendClient {
  const configuredMode = environment.VITE_PROTOCOL_MODE?.trim()
  const mode = configuredMode === undefined || configuredMode === ''
    ? environment.PROD === true ? 'live' : 'mock'
    : configuredMode
  if (mode === 'mock') {
    if (environment.PROD === true) {
      throw new Error('ArcBook production builds cannot run with VITE_PROTOCOL_MODE=mock.')
    }
    return createMockLiquidOBClient({ latencyMs: 0 })
  }
  if (mode !== 'live') throw new Error(`Unsupported VITE_PROTOCOL_MODE=${mode}.`)
  const apiUrl = requiredEnvironment('VITE_SOLVER_URL', environment.VITE_SOLVER_URL)
  const manifestUrl = requiredEnvironment(
    'VITE_DEPLOYMENT_MANIFEST_URL',
    environment.VITE_DEPLOYMENT_MANIFEST_URL,
  )
  const rpcUrl = environment.VITE_PUBLIC_RPC_URL?.trim()
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

let protocolClient: LiquidOBFrontendClient | undefined

export function getProtocolClient(): LiquidOBFrontendClient {
  protocolClient ??= createProtocolClient()
  return protocolClient
}
