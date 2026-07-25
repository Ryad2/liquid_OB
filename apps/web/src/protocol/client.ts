import type { LiquidOBFrontendClient } from '@liquid-ob/frontend-api'
import { createMockLiquidOBClient } from '@liquid-ob/frontend-api/mock'

/**
 * The only composition root for protocol data in the web application.
 * UI components must never import mock fixtures, RPC clients, or ABIs directly.
 */
export function createProtocolClient(): LiquidOBFrontendClient {
  const mode = import.meta.env.VITE_PROTOCOL_MODE ?? 'mock'
  if (mode === 'mock') {
    return createMockLiquidOBClient({ latencyMs: 0 })
  }

  throw new Error(
    `Unsupported VITE_PROTOCOL_MODE=${mode}. The live adapter is not implemented yet.`,
  )
}

export const protocolClient = createProtocolClient()
