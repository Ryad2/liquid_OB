# Liquid OB Implementation Order

Status: normative development sequence for the complete hackathon product.

This document answers **what to build next, in what order, and what must pass
before moving forward**. Product semantics remain in `PRODUCT_SPEC.md`, math in
`MATH_SPEC.md`, and module boundaries in `ARCHITECTURE.md`.

## 1. Governing Rule

Build Liquid OB as successive verified vertical slices, never as parallel piles
of unfinished contracts, services, and screens.

```text
official dependencies
    -> independent reference vectors
    -> Solidity curve kernel
    -> canonical strategy bytes
    -> one real Aqua/SwapVM fill
    -> two-sided recycling
    -> atomic multi-maker execution
    -> ABI/event freeze and public deployment
    -> exact SDK and pure solver
    -> native Liquid OB Subgraph
    -> live solver API
    -> maker/taker product UI
    -> reusable Graph MCP
    -> hardening, rehearsal, submission
```

Every arrow is a gate. A later layer must not hide a failing earlier layer.

Finalist compliance is also a cross-cutting gate. Localhost is permitted for
development, tests, and fallback, but no laptop-local process may be required
by the canonical submitted demo. The complete interpretation and acceptance
test are normative in
[`ETHGLOBAL_RULES_COMPLIANCE.md`](ETHGLOBAL_RULES_COMPLIANCE.md).

## 2. Development Loop For Every Phase

Use this loop for every implementation commit:

1. Write the smallest failing unit, integration, or invariant test that proves
   the new behavior.
2. Implement only enough code to satisfy that behavior.
3. Add boundary, revert, and adversarial cases.
4. Run the narrow test suite, then the complete Solidity and TypeScript suites.
5. Run formatting, lint, type checking, and `git diff --check`.
6. Update architecture, provenance, security assumptions, and AI disclosure if
   the implementation changed any of them.
7. Commit one coherent, independently green change.

Never combine dependency import, math, settlement, UI, and deployment changes
in one commit.

## 3. Phase 0: Protect The Critical Path

Implementation status: partial. Reproducible tooling and CI exist; the root
open-source license and final public hosting topology remain release blockers.

### Objective

Turn the empty scaffold into a reproducible build without writing protocol
logic yet.

### Work

- Confirm the submission deadline and reserve the final three to four hours for
  feature freeze, video, forms, and rehearsal.
- Select the repository's explicit open-source license before publishing the
  first protocol implementation.
- Create CI jobs for Foundry build/test/fmt/lint and pnpm
  check/lint/test/build.
- Define secrets and deployment manifests without committing RPC URLs, private
  keys, or API keys.
- Freeze the public network, web host, Graph deployment path, and either a
  browser-side or publicly hosted solver topology. Do not assume a local fork
  alone satisfies finalist live-deployment rules.
- Keep the existing Uniswap v4 hook evaluation out of the implementation
  backlog.

### Exit Gate

- A clean checkout installs and passes all empty-workspace checks.
- CI uses the same pinned Node, pnpm, Foundry, and compiler setup as local.
- The repository has an explicit license and no secret in Git history.
- The public demo topology has no unresolved localhost-only component.

## 4. Phase 1: Pin And Prove Aqua/SwapVM First

Implementation status: completed on 25 July 2026. The exact dependency matrix,
license boundary, local settlement proof, and official Base fork evidence are
recorded in [`DEPENDENCY_AUDIT.md`](DEPENDENCY_AUDIT.md). This status covers the
integration boundary only; no Liquid OB curve math is part of Phase 1.

### Why This Is First

The current Foundry scaffold pins Solidity `0.8.36`, while upstream contracts
may use exact compiler pragmas. Compiler, import, license, deployment, and
callback incompatibilities must be discovered before the curve kernel is built
around incorrect interfaces.

### Work

1. Pin exact Aqua, SwapVM, Aqua SDK, and required Solidity utility commits.
2. Review every license and record source, version, commit, files, and notices
   in `PROVENANCE.md`.
3. Resolve the compiler matrix without editing upstream source merely to make
   it compile.
4. Select two environments:
   - an official Aqua-supported local fork for integration tests;
   - a Graph-supported public demo network with either official contracts or a
     rules- and license-compliant deployment of the pinned source.
5. Add a minimal smoke test with a fixed trivial strategy:
   - maker approves Aqua;
   - maker calls `ship`;
   - a minimal custom SwapVM instruction quotes and executes;
   - Aqua performs a real `pull` and `push` token transfer;
   - maker calls `dock`.
6. Prove the SwapVM static quote path and execution path expose the information
   required for one custom instruction.

### Do Not Build Yet

- General alpha math.
- Two-sided recycling.
- Batch routing.
- Subgraph, solver, or web integration.

### Exit Gate

- Official pinned contracts compile unmodified.
- One real ERC-20 transfer settles through official Aqua and custom SwapVM.
- Quote and execution callbacks are understood and documented.
- The public-network plan is demonstrated, not assumed.

If this phase is blocked, stop and resolve it. It is cheaper to change the
settlement adapter here than after implementing the entire protocol.

## 5. Phase 2: Freeze Units, Types, Errors, Events, And Wire Format

Implementation status: completed on 25 July 2026. The canonical ABI, compact
payload, identifiers, rounding contract, event schema, and deterministic vector
are recorded in [`WIRE_FORMAT.md`](WIRE_FORMAT.md). This phase proves structural
canonicality only; mathematical commitment validation begins after the
independent Phase 3 oracle.

### Objective

Give every following layer one canonical language.

### File Order

1. `contracts/src/types/CurveTypes.sol`
2. `contracts/src/types/PositionTypes.sol`
3. `contracts/src/types/RouteTypes.sol`
4. `contracts/src/interfaces/ILiquidOBQuoter.sol`
5. `contracts/src/interfaces/ILiquidOBBatchExecutor.sol`
6. `contracts/src/interfaces/ILiquidOBLens.sol`
7. `contracts/src/libraries/PositionCodec.sol` interface and format only

### Decisions To Freeze

- Displayed price is quote per base.
- Native rate is output per input.
- Token amounts use native token decimals at transfer boundaries.
- Curve calculations use one named fixed-point scale.
- Signed-alpha encoding, min/max representable values, and special branches.
- Position key, market key, strategy version, salt, and strategy hash.
- Runtime fields `sellY`, `sellYInt`, `buyY`, `buyYInt`, and `version`.
- Exact-input and exact-output route structures.
- Canonical errors and event fields required by The Graph.
- Rounding direction for every public amount.

### Exit Gate

- Every struct field has a unit and direction documented in NatSpec.
- Events contain enough information for the Subgraph to reconstruct both sides
  without transaction-input scraping.
- The strategy format is versioned and has deterministic example encodings.
- No unresolved price-orientation ambiguity remains.

## 6. Phase 3: Build The Independent Mathematical Oracle

Implementation status: completed on 25 July 2026. The dependency-free Decimal
oracle, deterministic valid and invalid-domain JSON vectors, rounding
intervals, equation coverage, and regeneration procedure are documented in
[`REFERENCE_MODEL.md`](REFERENCE_MODEL.md).

### Objective

Create expected results that do not call Solidity implementation code.

### Work

- Implement a high-precision development-only reference evaluator from the
  equations in `MATH_SPEC.md`.
- Generate committed JSON vectors for:
  - positive and negative maker alpha;
  - maker alpha zero;
  - native alpha zero and native alpha one;
  - equal-endpoint flat orders;
  - buy and sell orientation conversion;
  - partial and full fills;
  - exact input and exact output;
  - near-empty and near-full domains;
  - effective prices;
  - homothetic rescaling and empty-side rearming;
  - invalid numerical domains.
- Include expected rounding intervals, not only ideal real-number values.

### Exit Gate

- Every normative equation has representative vectors.
- Vectors can be regenerated deterministically.
- The reference model has no dependency on future Solidity or SDK code.

## 7. Phase 4: Implement The Pure Solidity Kernel

Implementation status: Phases 4A and 4B completed on 25 July 2026. Checked
512-bit arithmetic, signed rounding, bounded logarithm/exponential/real powers,
stable near-zero transforms, exact identities, and approximation intervals are
covered by deterministic and fuzz tests. Phases 4C through 4E remain pending.

### Exact File Order

1. `FullPrecisionMath.sol`
2. `TranscendentalMath.sol`
3. `CurveCompiler.sol`
4. `CurveMath.sol`
5. `PositionMath.sol`

### 4A. Arithmetic First

Implement checked multiply/divide, signed conversion, explicit up/down rounding,
and overflow domains. Test every primitive before introducing logarithms or
curves.

### 4B. Transcendentals Second

Implement or import pinned `ln`, `exp`, and signed real powers. Exact flat,
native-alpha-zero, and native-alpha-one branches must bypass unstable generic
expressions.

Completed with pinned Solady v0.1.26 behind Liquid OB-owned domains,
full-precision power composition, stable `log1p`/`expm1`, exact identities, and
companion uncertainty intervals. See `TRANSCENDENTAL_MATH_AUDIT.md`.

### 4C. Direction Compiler Third

Implement displayed-to-native conversion:

- buy compiles directly;
- sell reciprocates endpoints and negates alpha;
- `betaNative = alphaNative - 1` is derived;
- equal endpoints select the flat branch.

### 4D. Curve Quote Fourth

Implement current marginal price, integrated coordinate, inverse coordinate,
exact-input, exact-output, post-fill price, and secant effective price.

### 4E. Two-Sided Transition Fifth

Implement active-side decrease, full opposite credit, proportional rescaling,
and empty-side rearm as a pure function. Do not touch storage or tokens yet.

### Required Tests

- Every committed reference vector.
- Coordinate/inverse round trips.
- Exact-input/exact-output near-inverse bounds.
- Monotonicity and domain preservation.
- Maker-favorable rounding.
- Conservation across both logical sides.
- Fuzz across the complete accepted numerical domain.
- Reverts outside that domain.

### Exit Gate

- All deterministic, differential, fuzz, and invariant math tests pass.
- No FFI or network access is required by the normal test suite.
- Gas is measured but not micro-optimized before correctness is frozen.

## 8. Phase 5: Mirror Math And Encoding In TypeScript Immediately

### Why This Happens Now

Waiting until the frontend phase to discover SDK/Solidity disagreement would
force changes to contracts, events, strategies, and deployed addresses.

### Work

1. Create `packages/curve-math`.
2. Reproduce every Solidity branch and rounding rule with bigint arithmetic.
3. Create the canonical strategy encoder/decoder.
4. Run the same committed vectors against Solidity and TypeScript.
5. Prove byte-identical strategy encoding and identical Aqua strategy hashes.

### Exit Gate

- Solidity and TypeScript agree on every vector and encoded byte.
- The package can preview both sides without wallet, RPC, or Subgraph access.
- Strategy encoding is frozen before custom router implementation.

## 9. Phase 6: Prove One Complete Position Vertically

### Build Order

1. `PositionRuntime.sol` as router-owned storage logic.
2. `LiquidCurveInstruction.sol` with exact-input execution first.
3. `LiquidOBSwapVMRouter.sol` as the Aqua app.
4. Exact-output execution through the same math.
5. `LiquidOBQuoter.sol` using the static path.
6. Single-position integration and fork tests.

### First Vertical Demo

```text
maker encodes one strategy
    -> Aqua.ship
    -> static quote
    -> taker exact-input swap
    -> real Aqua pull/push
    -> runtime version increments
    -> quote changes
    -> maker docks
```

Start with one non-flat direction, then add flat, signed-alpha, exact-output,
and opposite token orientation. Do not start batching until all paths use the
same quote kernel.

### Exit Gate

- Static quote exactly matches execution for exact input and exact output.
- A failed transfer rolls back runtime state and events.
- Docked, stale-version, exhausted, malformed, and under-allocated strategies
  revert deterministically.
- Official SwapVM invariant tooling passes for the custom instruction.

## 10. Phase 7: Complete Two-Sided Recycling And Lifecycle

### Work

- Integrate the pure `PositionMath` transition into runtime execution.
- Execute sell, credit quote to buy, and preserve buy marginal state by
  homothetic rescaling.
- Execute buy, credit base to sell, and preserve sell marginal state.
- Rearm either side when its logical outgoing reserve was zero.
- Ignore unsolicited Aqua surplus for logical-curve accounting.
- Implement `LiquidOBLens.sol` to reconcile immutable policy, logical runtime,
  Aqua allocation, maker wallet balance, allowance, and docked state.
- Implement SDK ship, dock, replace, and read helpers.

### Exit Gate

- Alternating buy/sell sequences preserve every invariant.
- Received assets become executable on the opposite side in the same
  transaction.
- No generic idle balance or keeper action exists.
- Dock-and-republish is the only parameter/top-up mutation flow.

At this point the **single-maker protocol** is complete.

## 11. Phase 8: Add Atomic Multi-Maker Execution

### Build Order

1. Route validation and hard `maxFills`.
2. Authenticated SwapVM callback handling.
3. Exact-input batch.
4. Aggregate `minAmountOut`, recipient, deadline, and refunds.
5. Exact-output batch.
6. Aggregate `maxAmountIn` and unused-input handling.
7. Duplicate-strategy rejection and expected-version checks.
8. Canonical `RouteExecuted` and ordered fill events.

### Required Tests

- Two and three makers in one route.
- Flat and curved positions together.
- Any middle-fill failure rolls back every prior fill and transfer.
- Stale version, expired deadline, slippage, duplicate strategy, callback
  spoofing, malformed strategy, and `maxFills` overflow.
- Exact aggregate token conservation and zero executor dust.
- Freshly recycled reverse liquidity cannot be recursively consumed in the
  same one-direction route.

### Exit Gate

- Exact-input and exact-output routes settle atomically across multiple makers.
- One transaction trace clearly shows every selected fill and final transfers.
- Gas is bounded by `maxFills` and recorded for one, four, and eight fills.

At this point the **onchain protocol MVP** is complete.

## 12. Phase 9: Security Gate And Contract Freeze

Do not deploy the public data/product stack before this gate.

### Work

- Full unit, differential, fuzz, invariant, integration, and fork suites.
- Stateful handler alternating publish, quote, buy, sell, dock, failed transfer,
  and unsolicited credit.
- Reentrancy and callback-authentication tests.
- Numerical extremes and rounding-drift campaigns.
- Storage-layout and event-schema review.
- Slither or equivalent static analysis where compatible.
- Gas snapshots and only evidence-backed optimization.
- Update `SECURITY.md` with explicit unsupported token behavior and known MVP
  limitations.

### Exit Gate

- No unresolved critical or high-severity finding.
- ABI, events, strategy encoding, and deployment constructor arguments freeze.
- Every public method has access-control, state-transition, and revert tests.

Changes after this point require a new deployment and Subgraph update.

## 13. Phase 10: Deployment, Manifests, And Generated Clients

### Build Order

1. Deployment and verification scripts.
2. Demo token/faucet contracts only where needed.
3. Seed-maker and ship-position scripts.
4. Dock/reset and complete demo-replay scripts.
5. Public deployment.
6. `deployments/<chainId>.json` manifest.
7. Generated ABI/types package in `packages/contracts`.
8. `packages/position-sdk` RPC, Quoter, Lens, executor, and Aqua clients.

### Exit Gate

- Addresses, deployment blocks, commits, explorers, and upstream Aqua address
  are recorded in one validated manifest.
- Contracts are verified where supported.
- A terminal-only maker publish and multi-maker taker execution works against
  the public deployment twice from a documented seeded state.

## 14. Phase 11: Implement The Pure Solver Before Networking

### Work

1. Create `packages/solver-core` with no Graph, RPC, HTTP, or wallet imports.
2. Define one normalized candidate-side structure from Subgraph fields.
3. Implement exact-input maximization.
4. Implement exact-output minimization.
5. Implement flat-order ordering and deterministic ties.
6. Implement water-filling, capacity clipping, fixed-point correction, route
   compression, and `maxFills`.
7. Produce route certificates with expected versions and per-fill quotes.
8. Compare small random markets against brute-force enumeration.

### Exit Gate

- Solver output is deterministic.
- Small-market results equal or beat brute force within documented rounding.
- Every output route passes the Solidity batch simulator on fixture states.

## 15. Phase 12: Index Our Own Micro-Pools With The Graph

### Why This Precedes The Live Solver And UI

The Subgraph is the primary market-state input, not a decorative analytics
page. Every maker position is an independent programmable micro-pool.

### Build Order

1. Freeze `subgraph.yaml` against deployment blocks and addresses.
2. Define `Market`, `Maker`, `Position`, `CurveSide`, `Fill`, `Route`, `Token`,
   and `MarketSnapshot` entities.
3. Decode Aqua `Shipped` strategy bytes into immutable curve fields.
4. Handle Aqua `Pushed`, `Pulled`, and `Docked` allocation/lifecycle events.
5. Handle router fill/runtime and executor route events.
6. Update both logical sides, `YInt`, version, prices, and activity.
7. Add mapping tests for publish, fill, recycle, route, and dock.
8. Deploy the live Subgraph and expose indexed block metadata.
9. Reconcile indexed entities against `LiquidOBLens` for seeded histories.

### Exit Gate

- One GraphQL query returns every eligible micro-pool for a market and side.
- A new fill changes both indexed sides and the next solver input.
- Subgraph state reconciles with Lens at the same block.
- Index lag is observable and bounded by policy.

## 16. Phase 13: Connect The Live Solver API

### Build Order

1. `GET /health` with chain head, indexed block, deployment, and lag.
2. GraphQL market-snapshot client with pagination.
3. Local global optimization over the complete indexed snapshot.
4. Bounded selected-plus-reserve shortlist.
5. Batched RPC refresh of versions, logical reserves, Aqua allocation, maker
   balance, and allowance.
6. Reoptimization after stale candidates.
7. Final `eth_call` simulation of exact executor calldata.
8. `POST /quote` and `POST /route` returning transparent unsigned results.
9. Timeouts, provider fallback, input bounds, and structured errors.

### Exit Gate

- No per-position RPC scan exists.
- The route response includes indexed block, head block, every fill, pre/post
  prices, effective price, expected version, aggregate limit, and calldata.
- Stale Graph, stale runtime, insufficient maker backing, RPC failure, and
  simulation revert produce safe explicit failures.

## 17. Phase 14: Build The Product UI Against Real Services

Early parallel work status: the framework-neutral frontend contract,
deterministic mock adapter, and web integration harness are implemented before
this phase to unblock product design. This does not satisfy Phase 14: the final
UI must still switch to deployed contracts, the live Subgraph, exact SDK math,
and a simulated solver route. Mock transaction plans are intentionally
unsendable.

Do not create separate mock-only protocol behavior. Component tests may mock
transport, but the primary development flow uses the deployed contracts,
Subgraph, and solver API.

### Build Order

1. Wallet, supported chain, manifest, token metadata, transaction state, and
   error surfaces.
2. Read-only market explorer proving live Subgraph integration.
3. Maker curve editor and exact visual preview from `curve-math`.
4. Aqua approvals and strategy `ship` flow.
5. Maker position details, backing warnings, dock, and replace flow.
6. Taker exact-input quote and route visualization.
7. Taker approval and atomic execution.
8. Exact-output mode.
9. Post-transaction refresh showing both recycled sides and changed next quote.
10. Mobile layout, loading, empty, stale, rejected-wallet, and failure states.

### Exit Gate

- The complete maker and taker demo needs no terminal or manual calldata.
- Every displayed amount states token and price direction.
- The UI never presents an unsimulated route as executable.
- The same seeded demo works twice without resetting contracts.

## 18. Phase 15: Build The Reusable Graph MCP Artifact

This phase begins only after the native Subgraph and solver are real.

### Work

- Implement `discover_positions`, `quote_liquid_ob`,
  `compare_executable_liquidity`, and `build_candidate_route`.
- Use the Liquid OB Subgraph as the first live data source.
- Compose one standardized DEX AMM Subgraph as the second source.
- Normalize token identities, displayed price direction, amount, block, and
  venue semantics.
- Return structured evidence and query provenance.
- Publish setup instructions, tool schemas, examples, and a two-to-four-minute
  tool video.

### Exit Gate

- A fresh environment can install and call the tools.
- The tools perform reasoning/action over live data rather than wrapping a
  hard-coded GraphQL response.
- Cross-venue comparison labels non-equivalent liquidity models honestly.

## 19. Phase 16: Final End-To-End And Adversarial Gate

### Mandatory Scenarios

1. Three makers publish distinct positions: flat, alpha zero, and signed alpha.
2. The Graph indexes all six directional sides.
3. Solver splits one exact-input route across at least two makers.
4. One transaction settles, recycles inventory, and updates versions.
5. The next Graph snapshot and quote are different.
6. Exact-output executes successfully.
7. One deliberately stale route fully reverts.
8. One maker docks and disappears from the next route.
9. MCP discovers and compares the live market.
10. All transaction, contract, Subgraph, and commit links are reproducible.

### Final Checks

- Full CI from a clean checkout.
- Public deployment verification.
- Gas report and known-limitations document.
- No secret, mock address, stale ABI, or local-only URL in production config.
- The zero-localhost acceptance test passes twice from a clean browser or
  second machine.
- Demo reset/reseed and fallback local-fork procedure.
- Two uninterrupted rehearsals and one recorded backup demo.

## 20. Phase 17: Submission Freeze

After feature freeze, implement no new protocol feature.

- Finalize README setup and architecture map.
- Link exact contracts and relevant lines for every sponsor.
- Complete `FEEDBACK.md` and the Uniswap feedback form.
- Include the identifying note associated with the private eligibility
  confirmation without publishing private messages.
- Verify The Graph endpoint, MCP instructions, video, public app, deployments,
  and transaction evidence from a fresh browser.
- Select the optional finalist add-on and no more than three partner
  organizations in the submission flow.
- Submit only after every mandatory field and bounty checkbox is independently
  reviewed.

## 21. Exact Commit Sequence

Each commit below must pass the complete available suite:

1. `build: pin official aqua and swapvm dependencies`
2. `test: prove official aqua and swapvm settlement smoke path`
3. `feat: define protocol units types errors and events`
4. `test: add independent high precision curve vectors`
5. `feat: implement checked full precision arithmetic`
6. `feat: implement bounded transcendental math`
7. `feat: implement curve compilation and exact quotes`
8. `feat: implement two sided position transitions`
9. `test: enforce curve differential fuzz and invariants`
10. `feat: mirror curve math and strategy encoding in typescript`
11. `feat: encode canonical swapvm position strategies`
12. `feat: execute one curve through swapvm and aqua`
13. `feat: add exact output quotes and single position quoter`
14. `feat: integrate two sided recycling and lifecycle lens`
15. `test: harden aqua lifecycle and runtime rollback`
16. `feat: execute atomic exact input routes`
17. `feat: execute atomic exact output routes`
18. `test: harden batch security invariants and gas bounds`
19. `chore: deploy and seed the public protocol environment`
20. `feat: generate contract clients and position sdk`
21. `feat: implement deterministic solver core`
22. `feat: index native liquid ob micro pools with the graph`
23. `feat: connect subgraph rpc refresh and route simulation`
24. `feat: build live maker position workflow`
25. `feat: build live taker routing and execution workflow`
26. `feat: add position manager and market explorer`
27. `feat: expose reusable graph liquidity tools`
28. `test: verify complete deployed protocol lifecycle`
29. `docs: finalize sponsor evidence feedback and demo`

## 22. What Must Not Happen

- Do not start with frontend screens and invent contract interfaces afterward.
- Do not optimize gas before exact math and conservation are proven.
- Do not implement batching before one position supports quote/execution parity
  in both amount modes.
- Do not deploy a Subgraph before events and strategy encoding freeze.
- Do not build the networked solver before the pure solver beats brute force.
- Do not refresh every maker position through RPC; use our native Subgraph.
- Do not add a Uniswap hook, fourth sponsor, oracle, fees, governance, proxy,
  arbitrary maker code, or cross-chain feature to the MVP.
- Do not call a local-fork demonstration a live indexed deployment.
- Do not continue to the next gate because a later mock makes the demo look
  green.

## 23. Immediate Next Action

The next implementation prompt should begin **Phase 4C only**:

1. implement buy-side displayed-to-native bounds directly;
2. implement sell-side reciprocal endpoint conversion and alpha sign change;
3. derive `betaNative = alphaNative - 1` without narrowing or overflow;
4. select and canonicalize the exact equal-endpoint flat branch;
5. derive deterministic `mu` and `kappa` commitments while using the Phase 4B
   intervals to reject nonpositive, overflowed, or numerically ambiguous
   configurations;
6. compare every compiler branch and rejected domain against the independent
   Phase 3 vectors.

Do not implement coordinate functions, exact-input/output swap maps, or
two-sided transitions until `CurveCompiler` passes independently.
