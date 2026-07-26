import { z } from 'zod'

const environmentSchema = z.object({
  LIQUIDITY_MCP_TRANSPORT: z.enum(['stdio', 'http']).default('stdio'),
  LIQUIDITY_MCP_HOST: z.string().default('0.0.0.0'),
  LIQUIDITY_MCP_PORT: z.coerce.number().int().min(1).max(65_535).default(3880),
  LIQUIDITY_MCP_ALLOWED_ORIGINS: z.string().optional(),
  LIQUID_OB_API_URL: z.string().url(),
  LIQUIDITY_MCP_TIMEOUT_MS: z.coerce.number().int().min(100).max(30_000).default(8_000),
  STANDARD_DEX_SUBGRAPH_URL: z.string().url().optional(),
  STANDARD_DEX_VENUE: z.string().min(1).default('Standardized DEX AMM'),
  STANDARD_DEX_MODEL: z.enum(['snapshot-only', 'constant-product-v2']).default('snapshot-only'),
  STANDARD_DEX_FEE_BPS: z.coerce.number().int().min(0).max(1_000).default(30),
})

export interface LiquidityMcpConfig {
  transport: 'stdio' | 'http'
  host: string
  port: number
  allowedOrigins: string[]
  liquidObApiUrl: string
  timeoutMs: number
  standardDex: {
    endpoint?: string
    venue: string
    model: 'snapshot-only' | 'constant-product-v2'
    feeBps: number
  }
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): LiquidityMcpConfig {
  const parsed = environmentSchema.parse(environment)
  return {
    transport: parsed.LIQUIDITY_MCP_TRANSPORT,
    host: parsed.LIQUIDITY_MCP_HOST,
    port: parsed.LIQUIDITY_MCP_PORT,
    allowedOrigins: parsed.LIQUIDITY_MCP_ALLOWED_ORIGINS?.split(',').map((value) => value.trim()).filter(Boolean) ?? [],
    liquidObApiUrl: trimSlash(parsed.LIQUID_OB_API_URL),
    timeoutMs: parsed.LIQUIDITY_MCP_TIMEOUT_MS,
    standardDex: {
      ...(parsed.STANDARD_DEX_SUBGRAPH_URL === undefined ? {} : { endpoint: parsed.STANDARD_DEX_SUBGRAPH_URL }),
      venue: parsed.STANDARD_DEX_VENUE,
      model: parsed.STANDARD_DEX_MODEL,
      feeBps: parsed.STANDARD_DEX_FEE_BPS,
    },
  }
}

function trimSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}
