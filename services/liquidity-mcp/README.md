# ArcBook Executable Liquidity MCP

Read-only Model Context Protocol server exposing curve-aware liquidity from the
ArcBook Solver API and an optional standardized DEX AMM Subgraph.

## Tools

- `discover_positions`: active, backed curves with indexed-block provenance.
- `quote_liquid_ob`: transparent unsigned multi-maker quote.
- `build_candidate_route`: unsigned calldata returned only after final
  BatchExecutor `eth_call` and gas simulation.
- `compare_executable_liquidity`: ArcBook simulation alongside a standardized
  Graph snapshot or explicitly configured constant-product-v2 estimate.

The comparison is deliberately asymmetric: only ArcBook calldata is labelled
onchain-simulated. A DEX Subgraph snapshot is never presented as an executable
quote.

## Run Over Stdio

```bash
LIQUID_OB_API_URL=http://127.0.0.1:3878 \
pnpm --filter @liquid-ob/liquidity-mcp start
```

Client configuration:

```json
{
  "mcpServers": {
    "liquid-ob": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/liquid_OB", "--filter", "@liquid-ob/liquidity-mcp", "start"],
      "env": { "LIQUID_OB_API_URL": "https://api.example" }
    }
  }
}
```

## Run As A Public MCP Service

```bash
cp services/liquidity-mcp/.env.example services/liquidity-mcp/.env
set -a
source services/liquidity-mcp/.env
set +a
pnpm --filter @liquid-ob/liquidity-mcp start
```

The Streamable HTTP endpoint is `/mcp`; probes are `/healthz` and `/readyz`.
Use HTTPS at the hosting edge and configure exact browser origins when needed.

## Verify

```bash
pnpm --filter @liquid-ob/liquidity-mcp check
pnpm --filter @liquid-ob/liquidity-mcp lint
pnpm --filter @liquid-ob/liquidity-mcp test
```
