# Liquid OB Frontend API

`@liquid-ob/frontend-api` is the framework-neutral contract between product UI
and the unfinished protocol stack. It lets frontend work proceed against a
deterministic mock without allowing mock assumptions to leak into components.

## Start With The Mock

```ts
import type { LiquidOBFrontendClient } from '@liquid-ob/frontend-api'
import { parseUnits } from '@liquid-ob/frontend-api'
import {
  createMockLiquidOBClient,
  MARKET_ID,
  QUOTE_TOKEN,
} from '@liquid-ob/frontend-api/mock'

const client: LiquidOBFrontendClient = createMockLiquidOBClient()

const quote = await client.quote({
  marketId: MARKET_ID,
  side: 'sell',
  kind: 'exact-input',
  amount: {
    token: QUOTE_TOKEN.address,
    raw: parseUnits('1000', QUOTE_TOKEN.decimals),
  },
  slippageBps: 50,
})
```

The mock contains one WETH/USDC market, three active makers, general signed
curves, exact singular branches, flat orders, explorer activity, exact-input
and exact-output routing, maker preview, and publish/execute/dock/replace plans.

## Client Surface

| Method | Product use | Future authoritative composition |
| --- | --- | --- |
| `getBootstrap` | Network, addresses, services, tokens, feature gates | Deployment manifest plus service health |
| `listMarkets` / `getMarket` | Market picker and explorer | Liquid OB Subgraph |
| `listPositions` | Order set, maker portfolio, solver transparency | Liquid OB Subgraph |
| `getPosition` | Complete manager view | Subgraph history plus Lens/RPC backing refresh |
| `previewPosition` | Maker editor and chart | Exact bigint `curve-math` and position SDK |
| `quote` | Taker exact-input/output route | Solver API, selected RPC refresh, final `eth_call` |
| `listActivity` | Fill, route, publish, and dock history | Liquid OB Subgraph |
| `preparePublish` | Aqua approvals and `ship` | Position SDK plus deployment manifest |
| `prepareExecute` | Approval and atomic executor call | Solver calldata plus generated contract clients |
| `prepareDock` | Cancel immutable strategy | Aqua SDK |
| `prepareReplace` | Dock then publish a new salt | Aqua SDK plus position SDK |

## Non-Negotiable Rules

- Components consume `LiquidOBFrontendClient`, never mock fixtures or ABIs.
- Raw integer strings are authoritative for token transfers.
- Displayed price is always quote per base.
- `sell` and `buy` are maker sides, not taker actions.
- Every response carries source, block, index lag, staleness, and warnings.
- Feature flags disable unavailable actions; hidden buttons are not a safety
  mechanism.
- A mock `TransactionPlan` has `sendable: false`. Never pass it to a wallet.
- The frontend may format values, but it may not recompute executable quotes.

## Tests

```bash
pnpm --filter @liquid-ob/frontend-api check
pnpm --filter @liquid-ob/frontend-api lint
pnpm --filter @liquid-ob/frontend-api test
```

Read [`docs/FRONTEND_HANDOFF.md`](../../docs/FRONTEND_HANDOFF.md) for complete
screen contracts, state machines, mock limitations, and the live-adapter plan.
