# Liquid OB Implementation Status

Status date: 25 July 2026. This is the authoritative capability inventory for
engineering and demo claims. Architecture documents describe the target;
completion claims come only from this file and passing tests.

## Executive Status

Liquid OB has a reproducible settlement dependency proof, frozen structural
protocol language, independent high-precision mathematical oracle, checked
full-precision and bounded transcendental Solidity arithmetic, and a typed
frontend boundary with deterministic mock data. It does **not** yet have the
curve compiler/quote kernel, custom curve execution, two-sided runtime, batch
router, live solver, Subgraph, public deployment, or final product UI.

The current repository is safe for parallel UI construction. It is not safe
for real funds, production claims, or a live protocol demo.

## What Is Implemented

| Area | Implemented evidence | What it proves |
| --- | --- | --- |
| Repository baseline | Pinned Node, pnpm, Foundry, Solidity, CI, provenance, security and contribution docs | Clean reproducible development environment |
| Aqua/SwapVM dependency boundary | Pinned Git submodules, preserved licenses, local real-transfer smoke tests, optional official Base fork proof | Official `ship`, quote, pull, push, rollback and dock behavior is understood |
| Canonical protocol language | Solidity unit types, position/route structs, errors, events, Quoter/Lens/Executor interfaces | Future layers share one direction, unit, identifier and event vocabulary |
| Position payload | Versioned 269-byte `PositionCodec`, structural validation, deterministic hashing tests | Immutable two-sided policy has one canonical structural encoding |
| Mathematical specification | Native direction, actual integrated bonding curve, exact input/output, dual means, singular branches, flat orders and recycling policy | Economic equations and orientation are frozen independently of Solidity |
| Independent oracle | 120-digit Decimal model, 14 curve vectors, 3 recycling vectors, 19 invalid-domain vectors, WAD intervals | Future Solidity and TypeScript math have language-neutral expected results |
| Full-precision arithmetic | 512-bit unsigned `mulDiv`, signed floor/ceiling, WAD helpers, checked casts, token normalization and reserve scaling with 17 deterministic/fuzz tests | Phase 4A integer operations preserve declared rounding and representation boundaries |
| Transcendental arithmetic | Pinned Solady backend behind bounded `ln`, `exp`, `log1p`, `expm1`, signed real powers, exact identities and conservative intervals with 17 deterministic/fuzz tests | Phase 4B has explicit numerical domains and approximation propagation independent of curve formulas |
| Frontend contract | `@liquid-ob/frontend-api` types, amount helpers, client interface and stable errors | UI can be built without importing unfinished ABIs or backend transports |
| Frontend mock | Three makers, market/position/activity reads, maker preview, exact-in/out routes and transaction plans | Every major screen can be developed with deterministic data |
| Web integration harness | One composition root consuming only `LiquidOBFrontendClient` | Mock-to-live replacement is isolated from components |

## What Is Not Implemented Yet

| Dependency order | Missing deliverable | Blocks |
| ---: | --- | --- |
| 1 | `CurveCompiler.sol`, `CurveMath.sol`, `PositionMath.sol` | Exact preview, swaps and recycling |
| 2 | Exact TypeScript `curve-math` and canonical strategy encoder | Live maker preview and publish calldata |
| 3 | Custom SwapVM curve instruction, router runtime and single-position settlement | Real position execution |
| 4 | Product Quoter, Lens and two-sided lifecycle integration | Live frontend reads and backing status |
| 5 | Atomic exact-input and exact-output batch executor | Multi-maker settlement |
| 6 | Security/fuzz/invariant/fork hardening and ABI freeze | Public deployment |
| 7 | Deployment scripts, public contracts, verified addresses and manifests | Any live frontend mode |
| 8 | Generated contract clients and position SDK | Wallet transaction plans |
| 9 | Deterministic solver core and solver API/browser adapter | Best-execution quotes |
| 10 | Liquid OB Subgraph and reconciliation tests | Market discovery, explorer and scalable solver input |
| 11 | Live frontend adapter and final maker/taker/manager/explorer UX | End-to-end public product |
| 12 | Graph MCP, monitoring, seeded demo, videos and submission evidence | Sponsor/finalist completion |

## Current User-Visible Capabilities

The frontend mock can currently demonstrate:

- market cards, bid/ask spread, block freshness and service health;
- positions with sell and buy curves, signed alpha, flat branches, reserves,
  progress, versions and backing status;
- exact-input and exact-output split routes across two makers;
- per-fill input/output, marginal/effective price, post-progress and opposite
  inventory credit;
- maker draft validation and marginal schedule sampling;
- publish, execute, dock and replacement transaction step UX;
- position and route activity feeds.

These are **frontend contracts and deterministic fixtures**, not live economic
results. Mock Holder samples use JavaScript `Number` for visualization. Mock
quotes use transparent fixed-point arithmetic at fixture prices, but they do
not implement the final integrated curve kernel or solver optimum. All mock
transaction plans are deliberately `sendable: false`.

## Frozen Versus Provisional

### Frozen Enough For Frontend

- Displayed price direction: quote per base.
- Maker side names: `sell` releases base; `buy` releases quote.
- Exact-input/exact-output semantics and aggregate slippage direction.
- Token, amount, market, position, curve, route, fill, activity and transaction
  plan product shapes.
- Raw amounts as unsigned decimal strings; WAD commitments as integer strings.
- Position lifecycle: active, docked or unknown.
- Immutable publish, full dock and dock-plus-republish replacement flow.
- Source/freshness metadata and feature-gated actions.

### Still Provisional Behind The Adapter

- Final contract addresses, deployment block and public chain profile.
- Generated ABIs and exact transaction calldata.
- Accepted EVM transcendental domains and final gas limits.
- Solver HTTP versus browser deployment choice.
- Subgraph endpoint, pagination implementation and final entity query fields.
- Wallet library and UI component framework choices.

Changing a provisional item must only require a live-adapter change. If it
requires rewriting product components, the frontend boundary has been broken.

## Active Risks And Release Blockers

1. Independent Liquid OB code still needs an explicit compatible open-source
   root license before finalist submission.
2. The selected official Aqua/SwapVM Base generation and Aqua SDK embedded
   address differ; deployment configuration must inject the audited address.
3. No compiled curve or protocol-specific math has executed through SwapVM yet.
4. No public deployment, manifest, Subgraph or hosted/browser solver exists.
5. No external security audit exists. Current software must use valueless demo
   assets only even after a public test deployment.
6. A successful local or mock demo does not satisfy ETHGlobal's live finalist
   gate.

## Definition Of Backend-Ready For Frontend Switch

The frontend remains in mock mode until all items below are true:

- contract ABI and strategy encoding freeze;
- public deployment manifest validates against the expected chain;
- generated Quoter, Lens, Executor and Aqua clients pass integration tests;
- one market is seeded with at least three backed positions;
- Subgraph returns those positions and indexed-block metadata;
- solver returns a route and final `eth_call` succeeds;
- publish, execute and dock transaction plans are generated from real ABIs;
- the zero-localhost flow works from a clean browser.

Until then, `VITE_PROTOCOL_MODE=live` must fail closed rather than silently
fall back to fixtures.
