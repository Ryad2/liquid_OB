import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { addressSchema, bytes32Schema, positiveRawAmountSchema, rawAmountSchema } from './schemas.js'
import type { ExecutableLiquidityService } from './service.js'

const routeInputSchema = z.object({
  marketId: bytes32Schema.describe('Liquid OB bytes32 market identifier'),
  side: z.enum(['sell', 'buy']).describe('Maker side consumed by the taker'),
  kind: z.enum(['exact-input', 'exact-output']),
  amount: positiveRawAmountSchema.describe('Positive native token-unit amount fixed by quote kind'),
  slippageBps: z.number().int().min(0).max(1_000).default(50),
  payer: addressSchema,
  recipient: addressSchema.optional(),
  refundRecipient: addressSchema.optional(),
  deadlineSeconds: z.number().int().min(30).max(3_600).default(600),
})

export function createLiquidityMcpServer(service: ExecutableLiquidityService): McpServer {
  const server = new McpServer({ name: 'liquid-ob-executable-liquidity', version: '1.0.0' }, {
    instructions: 'Use these read-only tools to discover Liquid OB curve positions, obtain transparent routes, and compare Graph-backed liquidity. Never treat an indexed DEX estimate as executable calldata.',
  })

  server.registerTool('discover_positions', {
    title: 'Discover Liquid OB positions',
    description: 'Discover active, backed maker curves for one market and side from the Liquid OB Subgraph snapshot.',
    inputSchema: z.object({
      marketId: bytes32Schema,
      side: z.enum(['sell', 'buy']),
      minimumOutputRaw: rawAmountSchema.optional().describe('Optional minimum outgoing capacity in native token units'),
      limit: z.number().int().min(1).max(100).default(20),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input, extra) => toolResult(await service.discoverPositions({
    marketId: input.marketId,
    side: input.side,
    limit: input.limit,
    ...(input.minimumOutputRaw === undefined ? {} : { minimumOutputRaw: input.minimumOutputRaw }),
  }, extra.signal)))

  server.registerTool('quote_liquid_ob', {
    title: 'Quote Liquid OB',
    description: 'Build a transparent unsigned multi-maker Liquid OB quote after Graph discovery and bounded onchain refresh. This does not return a transaction as executable.',
    inputSchema: routeInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input, extra) => toolResult(await service.quoteLiquidOb(withRecipientDefaults(input), extra.signal)))

  server.registerTool('build_candidate_route', {
    title: 'Build simulated Liquid OB route',
    description: 'Build unsigned BatchExecutor calldata and return it only after final eth_call and gas simulation at the current chain head.',
    inputSchema: routeInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input, extra) => toolResult(await service.buildCandidateRoute(withRecipientDefaults(input), extra.signal)))

  server.registerTool('compare_executable_liquidity', {
    title: 'Compare Graph-backed liquidity',
    description: 'Compare an onchain-simulated Liquid OB route with a standardized DEX Subgraph snapshot. The response explicitly distinguishes executable calldata from indexed estimates.',
    inputSchema: routeInputSchema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }, async (input, extra) => toolResult(await service.compareExecutableLiquidity(withRecipientDefaults(input), extra.signal)))

  server.registerResource(
    'liquid-ob-semantics',
    'liquid-ob://semantics',
    { title: 'Liquid OB liquidity semantics', mimeType: 'text/markdown' },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'text/markdown',
        text: [
          '# Liquid OB executable-liquidity semantics',
          '',
          '- Displayed prices are quote token per base token.',
          '- `sell` consumes quote and releases base; `buy` consumes base and releases quote.',
          '- Liquid OB routes marked `onchain-simulated` passed BatchExecutor `eth_call` but remain unsigned.',
          '- Standardized DEX snapshots and modelled estimates are never labelled executable.',
          '- The Graph is candidate discovery; contracts remain the settlement authority.',
        ].join('\n'),
      }],
    }),
  )

  return server
}

function withRecipientDefaults(input: z.infer<typeof routeInputSchema>) {
  return {
    ...input,
    recipient: input.recipient ?? input.payer,
    refundRecipient: input.refundRecipient ?? input.payer,
  }
}

function toolResult(value: Record<string, unknown>) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
  }
}
