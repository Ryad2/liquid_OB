# Frontend Handoff Contract

Status: normative frontend integration guide for parallel UI development.
Read [`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md) first to separate
implemented evidence from target architecture.

## 1. One Boundary, Two Implementations

Every product component talks to one framework-neutral interface:

```text
React screens and state
        |
        v
LiquidOBFrontendClient
        |
        +-- now: deterministic MockLiquidOBClient
        |
        +-- later: LiveLiquidOBClient
                  |
                  +-- deployment manifest
                  +-- exact curve-math / position SDK
                  +-- Liquid OB Subgraph
                  +-- solver and final eth_call
                  +-- Lens, Quoter, Executor and Aqua clients
```

The web composition root is exactly
`apps/web/src/protocol/client.ts`. Components must not inspect
`VITE_PROTOCOL_MODE`, import mock fixtures, read ABIs, issue GraphQL, call RPC,
or assemble calldata.

## 2. Start Building Immediately

```bash
pnpm install --frozen-lockfile
cp apps/web/.env.example apps/web/.env.local
pnpm dev
```

The default mode is `mock`. For another frontend package:

```ts
import type { LiquidOBFrontendClient } from '@liquid-ob/frontend-api'
import { createMockLiquidOBClient } from '@liquid-ob/frontend-api/mock'

export const protocol: LiquidOBFrontendClient = createMockLiquidOBClient()
```

Use the interface type everywhere, never the concrete mock class. Keep wallet
connection separate from protocol reads and transaction preparation.

## 3. Frontend Data Contract

### 3.1 Amounts And Prices

- `TokenAmount.raw` is the authoritative token-native unsigned integer string.
- `TokenAmount.formatted` is display convenience only.
- `WadInteger` is an integer string scaled by `1e18`.
- Never store executable values in JavaScript `number`.
- Parse user token input with `parseUnits`; reject excess precision.
- Displayed `DisplayPrice` is always quote token per one base token.
- `NativeRate` is outgoing token per incoming token and should normally remain
  in advanced/debug views.
- Required input rounds up; delivered output rounds down.
- The frontend never applies another rounding step to a returned route.

### 3.2 Direction Vocabulary

`CurveSide` is the maker side consumed by the taker:

| Side | Maker releases | Taker pays | Taker receives | Price movement |
| --- | --- | --- | --- | --- |
| `sell` | Base | Quote | Base | Ask increases |
| `buy` | Quote | Base | Quote | Bid decreases |

Avoid ambiguous UI labels such as only "buy" or "sell". Prefer explicit copy:
"Pay USDC, receive WETH" and "Pay WETH, receive USDC".

### 3.3 Freshness

Every list, detail and quote exposes `DataMeta`:

- `source`: which subsystem produced the response;
- `chainHeadBlock`: latest observed RPC block;
- `indexedBlock`: block represented by indexed state;
- `indexLag`: head minus indexed block;
- `stale`: whether policy says the result is unsafe;
- `warnings`: user-visible limitations.

Do not hide freshness in a tooltip. Taker quotes and explorer pages should show
it beside the primary action. Disable execution when `stale` is true or final
simulation did not succeed.

## 4. Method-To-Backend Mapping

| Client method | Mock behavior | Future live implementation |
| --- | --- | --- |
| `getBootstrap` | Fake chain, addresses, health and feature flags | Validate `deployments/<chainId>.json`; poll RPC/Subgraph/solver health |
| `listMarkets` | One deterministic WETH/USDC market | Paginated Subgraph market query with `_meta` block |
| `getMarket` | Bid, ask, spread and aggregate fixture | Subgraph market plus current indexed metadata |
| `listPositions` | Three maker micro-pools | Paginated/filterable Subgraph `Position`/`CurveSide` query |
| `getPosition` | Full runtime and backing fixture | Subgraph immutable/history plus batched Lens/RPC reconciliation |
| `previewPosition` | Visual Holder samples and structural checks | Exact bigint curve math, compiler, payload and policy hash |
| `quote` | Two-maker deterministic route | Subgraph discovery, pure solver, selected RPC refresh and final `eth_call` |
| `listActivity` | Route and fill fixtures | Subgraph publish/fill/route/dock entities |
| `preparePublish` | Unsendable approval/ship plan | Exact Aqua approvals and canonical strategy `ship` calldata |
| `prepareExecute` | Unsendable approval/executor plan | Approval plus solver-certified Executor calldata |
| `prepareDock` | Unsendable dock plan | Exact Aqua `dock` calldata for both assets |
| `prepareReplace` | Dock then publish steps | Dock old immutable strategy, compile new salt, approve and ship |

The live adapter may compose several sources, but the response shape and
product semantics remain unchanged.

## 5. Required Screens

### 5.1 Application Shell

Must show wallet state, selected network, protocol mode, service health and a
persistent mock/live badge. Unsupported network and missing deployment are
blocking states, not console errors.

### 5.2 Market Explorer

Use `listMarkets`, `getMarket`, `listPositions` and `listActivity` to show:

- canonical base/quote pair;
- best bid, best ask and spread;
- active position and side counts;
- indexed block and lag;
- maker, branch, alpha, current marginal price, capacity and backing;
- fills and routes with transaction links in live mode.

Filters must serialize into URL state so a judge can share and refresh a view.

### 5.3 Maker Studio

Inputs for each side:

- displayed start and end price;
- signed alpha;
- initial outgoing reserve;
- base/quote token selection.

Call `previewPosition` while editing and render returned issues by `path`.
Chart only `marginalSamples` as the marginal schedule; do not label it the
reserve bonding curve. For equal endpoints, show a flat price-and-volume order
and explain that alpha is canonicalized to zero.

Publish flow:

1. Preview is valid and `canPublish` is true.
2. User reviews both sides, spread, reserves and immutable-policy warning.
3. Call `preparePublish` with connected maker address.
4. Render every ordered plan step.
5. In live mode, wallet sends one step at a time and UI waits for receipt.
6. Wait for Subgraph indexing, then open the new position detail.

### 5.4 Taker Terminal

Inputs:

- market;
- explicit pay/receive direction;
- exact-input or exact-output mode;
- caller-fixed raw amount derived from token input;
- slippage, recipient and deadline.

Call `quote` after a short debounce or explicit submit. Render:

- aggregate input, output, limit and displayed effective price;
- indexed block, head, lag, expiry and simulation status;
- every maker split with version, pre/post marginal price and progress;
- opposite-side inventory credit, because recycling is core product behavior;
- price impact and worst marginal price.

Execution is enabled only when:

- `features.executeRoutes` and `features.liveWrites` are true;
- wallet chain matches bootstrap chain;
- quote is not stale or expired;
- simulation status is `success`;
- `prepareExecute` returns `sendable: true`.

Mock plans return `sendable: false` by construction. Do not bypass this check.

### 5.5 Position Manager

Use `listPositions({ maker })` and `getPosition` to show immutable policy,
runtime version, both logical states, Aqua allocation, wallet balance,
allowance and backing warnings.

Only these actions exist in the MVP:

- dock the complete immutable position;
- replace by docking and publishing a new salted strategy;
- update external ERC-20 allowance as part of a prepared plan.

There is no edit, LP share, partial withdrawal or direct reserve top-up button.

## 6. UI State Machines

Every asynchronous read should expose exactly:

```text
idle -> loading -> success
               -> empty
               -> error(retryable | terminal)
success -> refreshing (keep previous data visible)
```

Transaction steps should expose:

```text
ready -> awaiting-wallet -> submitted(hash) -> confirmed(receipt)
                     |                 |
                     v                 v
                  rejected           reverted
confirmed -> indexing -> indexed
```

Never show a transaction as successful before receipt. Never show indexed
state before the Subgraph reaches the receipt block. Preserve transaction hash
and error code across refreshes when possible.

## 7. Error Presentation

`FrontendGatewayError.code` is stable UI logic; `message` is readable fallback.

| Code | Default UI action |
| --- | --- |
| `ABORTED` | No toast; a newer request replaced it |
| `INVALID_ARGUMENT` / `INVALID_AMOUNT` | Inline field or form error |
| `NOT_FOUND` | Empty/not-found screen with navigation |
| `INSUFFICIENT_LIQUIDITY` | Preserve input and explain available capacity |
| `FEATURE_UNAVAILABLE` | Disabled action plus implementation status |
| `STALE_QUOTE` | Refresh quote automatically or ask user to requote |
| `UNSUPPORTED_NETWORK` | Wallet network switch action |
| `UNBACKED_POSITION` | Remove from executable route; explain maker backing |
| `SIMULATION_REVERTED` | Block execution and show stable revert code |
| `SERVICE_UNAVAILABLE` | Retry with service health context |

Do not expose raw RPC stack traces or pretend a solver timeout means no
liquidity.

## 8. Mock Guarantees And Limits

The mock guarantees deterministic product shapes, filters, pagination,
cancellation, clone-safe responses, exact raw amount handling and coherent
transaction ordering. It intentionally includes:

- a general positive-alpha position;
- alpha-zero and native-alpha-one paths;
- conventional flat orders;
- negative-alpha curves;
- three makers and two-fill route splits;
- exact-input and exact-output examples;
- recycling fields and block freshness.

The mock does not guarantee final curve economics, optimal routing, gas,
calldata, contract addresses, transaction hashes or public-chain behavior.
Visual marginal samples use floating point and are explicitly labelled mock.
No screenshot or demo may present them as live data.

## 9. Live Adapter Implementation Plan

Implement `LiquidOBFrontendClient` in this dependency order:

1. Parse and validate the deployment manifest; implement `getBootstrap`.
2. Add exact `curve-math`; replace maker preview and emit canonical payload.
3. Add Subgraph reads for markets, positions and activity with `_meta` blocks.
4. Add Lens/RPC refresh for position detail and backing.
5. Add solver quote transport and validate every response at runtime.
6. Re-run final route through `eth_call`; expose only successful simulation.
7. Add generated clients for publish, execute, dock and replace plans.
8. Set `sendable: true` only for plans built from the validated current
   deployment and chain.
9. Switch `apps/web/src/protocol/client.ts` from mock to live based on explicit
   environment configuration. Never auto-fallback from live to mock.
10. Run the same contract tests against both clients, then complete E2E wallet
    tests against the public seeded deployment.

## 10. Environment Contract

Mock development:

```text
VITE_PROTOCOL_MODE=mock
VITE_CHAIN_ID=31337
VITE_PUBLIC_RPC_URL=
```

Future live production:

```text
VITE_PROTOCOL_MODE=live
VITE_CHAIN_ID=<manifest chain id>
VITE_PUBLIC_RPC_URL=<public browser-safe RPC or empty when proxied>
VITE_DEPLOYMENT_MANIFEST_URL=<public immutable manifest>
VITE_SUBGRAPH_URL=<public Graph endpoint>
VITE_SOLVER_URL=<public HTTPS endpoint; empty only for browser solver>
```

Private RPC credentials, deployer keys and sponsor API keys must never use a
`VITE_` variable.

## 11. Frontend Acceptance Checklist

- [ ] No component imports `@liquid-ob/frontend-api/mock`.
- [ ] Only the composition root selects mock or live client.
- [ ] Every amount input converts to raw integer before requesting a quote.
- [ ] Every price label says quote/base or names both tokens.
- [ ] Taker direction says pay/receive tokens explicitly.
- [ ] Flat, alpha-zero and general branches have distinct explanatory copy.
- [ ] Quote shows source, indexed block, lag, expiry and simulation.
- [ ] Route shows every selected maker and opposite-side credit.
- [ ] Mock badge is persistent and mock plans cannot reach wallet code.
- [ ] Publish/execute/dock plans render ordered transaction states.
- [ ] Wrong chain, rejected signature, revert, stale quote, empty liquidity,
      unbacked maker and service outage are designed states.
- [ ] Desktop and mobile layouts preserve all safety information.
- [ ] Live mode never silently falls back to mock.
- [ ] Final public build passes the zero-localhost acceptance test twice.
