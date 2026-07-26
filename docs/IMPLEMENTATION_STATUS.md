# Liquid OB Implementation Status

Status date: 26 July 2026. This is the authoritative capability inventory for
engineering and demo claims. Architecture documents describe the target;
completion claims come only from this file and passing tests.

## Executive Status

Liquid OB now has a reproducible settlement dependency proof, frozen protocol
language, independent high-precision oracle, executable Solidity curve kernel,
TypeScript maker SDK, lifecycle Lens, and atomic multi-maker Aqua/SwapVM
settlement. Exact-input and exact-output fills update a versioned two-sided
runtime and immediately recycle incoming inventory into the opposite curve.
The demo-scoped security gate covers adversarial route validation and atomic
rollback. Deployment tooling, generated ABIs, a deterministic multi-maker
solver, native Subgraph, stateless solver API, live frontend adapter, wallet
transaction state machine, ArcBook UI and reusable Graph-backed MCP service are
implemented and locally tested. Deployment verification, container builds,
health/metrics probes and a strict public release smoke gate are also present.
It does **not** yet have public contract, Subgraph, API, MCP or web deployments.

The current repository is ready for public test deployment integration. It is
not safe for real funds or production claims, and mock UI state must not be
presented as live protocol state.

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
| Solidity curve kernel | `CurveCompiler`, `CurveMath`, and `PositionMath` with representative branch, orientation, flat-level, quote-inverse, and recycling tests | Maker parameters compile into executable exact-input/exact-output state transitions |
| TypeScript curve SDK | `@liquid-ob/curve-math` compiler, preview, transition, canonical payload and SwapVM strategy encoder with Solidity payload-vector parity | Frontends can build a position and preview it before obtaining an authoritative onchain quote |
| Aqua curve settlement | Custom `LiquidCurveInstruction`, `LiquidOBSwapVMRouter`, product `LiquidOBQuoter`, and two-direction integration test | One shipped maker position quotes without mutation, transfers real tokens, recycles inventory, and advances runtime atomically |
| Position lifecycle and Lens | `LiquidOBLens` reconciles canonical policy, resolved runtime, Aqua lifecycle/allocation, wallet balance and allowance | UI and solver diagnostics can distinguish active, under-backed, surplus-funded and docked positions without influencing settlement |
| Atomic multi-maker settlement | `LiquidOBBatchExecutor` validates bounded solver fills and executes exact-input or exact-output routes through SwapVM with direct recipient settlement | Two-maker routes enforce aggregate limits, refund unused input, leave no executor dust, and roll back every fill if any later fill fails |
| Demo security gate | Adversarial settlement tests, explicit trust/token assumptions, frozen ABI surface and committed gas baseline | Forged, stale, duplicate, expired, docked, under-backed and aggregate-limit failures are rejected or atomically rolled back |
| Deployment and client tooling | Foundry deploy/seed/replay/dock scripts, manifest bytecode validation, generated ABI package and typed position SDK | A fresh topology can publish, read, quote and settle; the same source can be promoted to a public manifest without hand-written calldata |
| Deterministic solver | Pure `@liquid-ob/solver-core` exact-input/output optimizer with capacity clipping, stable tie-breaks, fill bounds and reserve shortlist | A complete indexed market snapshot can be converted into a reproducible best-execution certificate without RPC or hidden state |
| Native Subgraph | Protocol entities and Aqua/Router/BatchExecutor mappings, canonical strategy decoder, pagination queries and Matchstick lifecycle tests | Published positions, allocations, recycled sides, fills, routes and snapshots can be discovered at a declared indexed block |
| Solver API | Fastify Graph-to-solver-to-Lens-to-Quoter pipeline with freshness gates, calldata encoding and final `eth_call`/gas simulation | An untrusted stateless service can return unsigned, version-bound BatchExecutor routes while settlement remains authoritative onchain |
| Product read API | Bootstrap, markets, positions, details and activity endpoints pinned to one indexed Graph block with Lens reconciliation | The product can render coherent live state without querying GraphQL or RPC directly from components |
| Frontend contract | `@liquid-ob/frontend-api` types, amount helpers, client interface and stable errors | UI can be built without importing unfinished ABIs or backend transports |
| Frontend mock | Three makers, market/position/activity reads, maker preview, exact-in/out routes and transaction plans | Every major screen can be developed with deterministic data |
| Live frontend adapter | `@liquid-ob/frontend-live` runtime schemas, manifest/API reconciliation, exact preview, Aqua publication, execution and dock/replace plans | Live mode fails closed on stale/mismatched infrastructure and emits only deployment-bound transaction plans |
| Wallet and ArcBook UI | EIP-1193 connect/switch/send/receipt flow plus responsive landing, order book, route ticket, portfolio and curve composer | A connected user can publish, execute and dock through the same product gateway without component-level ABI coupling |
| Executable Liquidity MCP | Four read-only MCP tools over stdio and stateless Streamable HTTP, with Liquid OB simulation and optional standardized DEX Graph evidence | Agents can discover and reason over curve liquidity while executable and merely indexed evidence remain explicitly distinct |
| Release operations | Non-root API/MCP/web images, Compose, testnet/Subgraph/image workflows, probes, metrics, bytecode verifier and public zero-localhost gate | The same tested artifacts can be promoted without hand-editing addresses or accepting mock/local dependencies |

## What Is Not Implemented Yet

| Dependency order | Missing deliverable | Blocks |
| ---: | --- | --- |
| 1 | Choose a compatible root open-source license | Public sponsor/finalist eligibility |
| 2 | Run the protected testnet deployment workflow, verify explorers and merge its generated manifest | Public writes and immutable deployment identity |
| 3 | Deploy the Subgraph; host API, MCP and web images behind HTTPS | Public discovery, routing and product access |
| 4 | Seed three positions and pass `pnpm release:verify` plus clean-browser wallet E2E twice | Reliable zero-localhost judging demo |
| 5 | Complete firsthand `FEEDBACK.md`, sponsor form, screenshots, video and submission links | Sponsor/finalist submission |
| 6 | Obtain independent security review before using assets of value | Any production or real-funds claim |

## Current User-Visible Capabilities

ArcBook can demonstrate all screens against deterministic mock state. With a
valid public environment, the same composition root additionally supports:

- market cards, bid/ask spread, block freshness and service health;
- positions with sell and buy curves, signed alpha, flat branches, reserves,
  progress, versions and backing status;
- exact-input and exact-output split routes across two makers;
- per-fill input/output, marginal/effective price, post-progress and opposite
  inventory credit;
- maker draft validation and marginal schedule sampling;
- publish, execute, dock and replacement transaction step UX;
- position and route activity feeds.
- wallet network switching and ordered approval/publication/execution/dock
  transactions with receipt/revert handling;
- manifest/API/chain agreement checks and fail-closed live feature flags.

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

### Deployment-Specific

- Final public contract addresses, deployment block and chain profile.
- Public Subgraph/API endpoints and deployment-specific pagination limits.
- Public MCP and web URLs, Graph deployment ID and transaction evidence.

Changing a provisional item must only require a live-adapter change. If it
requires rewriting product components, the frontend boundary has been broken.

## Active Risks And Release Blockers

1. Independent Liquid OB code still needs an explicit compatible open-source
   root license before finalist submission.
2. The selected official Aqua/SwapVM Base generation and Aqua SDK embedded
   address differ; deployment configuration must inject the audited address.
3. Single- and multi-position curve settlement are proven locally but have not
   yet run on a public network.
4. The Subgraph, solver API, MCP and web app exist in source but have no
   recorded public endpoints; ArcBook live mode therefore cannot yet satisfy
   the zero-localhost gate.
5. No external security audit exists. Current software must use valueless demo
   assets only even after a public test deployment.
6. A successful local or mock demo does not satisfy ETHGlobal's live finalist
   gate.

## Definition Of Public Live Readiness

Build-time live support is complete. Enable it for the submitted application
only when all items below are true:

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
