# Uniswap v4 Hook Architecture Evaluation

Status: accepted architecture evaluation for the hackathon MVP.

Date: 25 July 2026

## 1. Verdict

A Uniswap v4 custom-accounting hook is a technically valid way to implement
Liquid OB. It could consume an entire swap inside `beforeSwap`, bypass native
concentrated-liquidity pricing, execute the selected maker curves, and return
the resulting deltas through `PoolManager`.

It is **not the better core architecture for the current hackathon build**.
Liquid OB should keep Aqua/SwapVM as its single MVP settlement backend and must
not attempt to nest Aqua execution inside a v4 hook. A v4-native backend is a
serious post-MVP alternative that should be benchmarked independently, not a
weekend integration added for branding.

The reasons are architectural, security-related, and strategic:

- Aqua naturally represents one immutable strategy and allocation per maker;
- SwapVM naturally represents the custom executable program;
- a v4 hook would require a new backed maker-deposit and solvency ledger;
- custom return-delta accounting would sit directly in the swap-critical path;
- calling Aqua from the hook would combine two callback and settlement models;
- the current Uniswap hook bounty belongs to the Continuity Track, while this
  project is in the standard track;
- project-specific written confirmation already permits the Uniswap API bounty
  submission without an artificial runtime integration;
- replacing the backend now would weaken the strongest 1inch submission and
  delay the curve, routing, Graph, and demo-critical work.

## 2. What A Real Hook Implementation Would Be

A real implementation would not convert every maker curve into Uniswap ticks.
That would approximate the analytical curve, multiply liquidity mutations, and
lose the protocol's exact execution semantics.

Instead, the hook would be a complete custom market engine:

1. Initialize one v4 pool per base/quote market with the Liquid OB hook.
2. Store every maker's two immutable curve configurations and mutable logical
   reserves in hook-controlled state.
3. Define deposit, withdrawal, cancellation, and replacement flows backed by
   tokens or claims held through `PoolManager` accounting.
4. Index all maker micro-pools and their curve states through The Graph.
5. Let the offchain solver place a bounded selected route in `hookData`.
6. In `beforeSwap`, recompute every selected fill, update both sides, consume
   the complete specified amount with a return delta, and leave no residual
   amount for native concentrated-liquidity math.
7. Resolve the aggregate input and output through v4 flash accounting.

This is a **NoOp/custom-curve swap** in Uniswap terminology: the pool entry
point remains v4, but the hook owns the pricing and maker accounting.

One hook contract can serve multiple v4 pools, but each pool can attach only
one hook. Hook permissions are encoded in the deployed address and therefore
must be mined and verified during deployment.

## 3. Genuine Advantages

### 3.1 Net Token Settlement

`PoolManager` flash accounting tracks transient credits and debts and settles
only final deltas. A multi-maker route could therefore require only aggregate
input/output transfers instead of one ERC-20 transfer per maker. This is a real
potential gas advantage, but it remains a hypothesis until both backends are
implemented and benchmarked over identical routes.

### 3.2 Uniswap-Native Entry Point

The market would expose the standard v4 pool swap path. Existing v4-aware
routers could technically call it once they support the pool and required
`hookData` format.

This does not guarantee distribution: attaching a hook does not automatically
make the Uniswap interface or external routers send flow to it.

### 3.3 Hybrid Liquidity Is Possible

A future design could let the custom maker curves consume part of an order and
leave a residual amount for native v4 liquidity. That could combine functional
orders with a conventional AMM backstop.

This is explicitly outside the MVP because it creates two pricing engines,
partial-consumption rules, and additional route-ordering and MEV questions.

### 3.4 Shared Infrastructure

Pool initialization, transient delta accounting, token settlement primitives,
and the wider v4 tooling ecosystem would be reused rather than rebuilt.

## 4. Material Costs And Risks

### 4.1 Position Model Mismatch

Uniswap's native pool state represents shared concentrated liquidity. Liquid
OB represents many independently owned two-sided curves. A hook can implement
that model, but `PoolManager` does not provide the maker-level curve ledger,
cross-recycling, versioning, or cancellation rules. All of those remain custom
Liquid OB code.

### 4.2 New Custody And Solvency Ledger

Aqua keeps assets in each maker's wallet and enforces the final transfer from
that maker. A v4-native backend would pool backing in `PoolManager` or maintain
claims against it. Liquid OB would then have to prove at all times that:

```text
sum(all maker logical outgoing reserves for token T)
    <= backing controlled for Liquid OB in PoolManager for token T
```

Deposit, withdrawal, cancellation, rounding dust, donations, claims, and
emergency behavior all become part of the protocol's critical accounting.

### 4.3 Return-Delta Risk

The hook would directly override trader input/output deltas. A sign mistake,
incorrect exact-input/exact-output convention, rounding bug, or stale runtime
update can misprice a trade or create unbacked accounting. This duplicates the
most difficult parts of both the curve kernel and settlement layer inside one
callback.

### 4.4 Callback And External-Call Risk

Calling Aqua/SwapVM from `beforeSwap` would combine:

- v4 unlock and transient-delta accounting;
- hook callback permissions and reentrancy rules;
- SwapVM execution and callback validation;
- Aqua pull/push transfers and maker-specific failures.

This nested design has no compelling MVP benefit. If a v4 backend is built, it
should settle natively through `PoolManager`; if Aqua is used, it should remain
the sole settlement backend for that deployment.

### 4.5 No Automatic Routing Benefit

Uniswap explicitly notes that creating a hook does not guarantee routing from
its frontend. Liquid OB would still need its own Subgraph, solver, UI,
integration documentation, and likely router support.

### 4.6 Hackathon Opportunity Cost

For this event, a hook pivot would exchange one deep, directly eligible
Aqua/SwapVM integration for:

- a more complex backend;
- no access to the v4 hook/stack bounty because it is Continuity-only;
- no formal API integration unless separately added;
- less time for the visible multi-maker route and self-recycling demo.

That is a worse expected-value trade for the current submission.

## 5. Architecture Comparison

| Criterion | Aqua/SwapVM MVP | v4 custom-accounting hook |
| --- | --- | --- |
| Maker position mapping | Native immutable strategy per maker | Custom maker ledger inside hook |
| Asset location | Maker wallet until execution | PoolManager-backed deposit or claim design |
| Shared allocation | Native Aqua capability | Must be designed explicitly |
| Curve execution | Custom SwapVM opcode | Custom `beforeSwap` return-delta logic |
| Multi-maker token transfers | Potentially one maker transfer per fill | Potential aggregate net settlement |
| Gas advantage | Unknown until benchmark | Potentially better transfers; more custom storage |
| Global solver | The Graph plus offchain solver | The same Graph plus offchain solver |
| Automatic Uniswap flow | No | Also no guarantee |
| 1inch bounty fit | Direct and strongest | Lost or made artificially nested |
| Uniswap standard-track fit | Written project-specific waiver | Better narrative, but still not the API requirement |
| Hook/stack prize | Not applicable | Continuity-only, so unavailable |
| Security surface | Curve + SwapVM/Aqua integration | Curve + custom custody + deltas + callbacks |
| Weekend execution risk | Controlled by staged gates | High |

## 6. Recommended Path

### Hackathon

Keep the normative architecture in [`ARCHITECTURE.md`](ARCHITECTURE.md):

- Aqua is the allocation and maker-wallet settlement layer;
- SwapVM is the executable program and custom-opcode layer;
- The Graph indexes every Liquid OB maker micro-pool;
- the offchain solver returns a bounded route;
- the batch executor validates and settles through one backend.

Do not implement a v4 hook before the complete two-sided Aqua flow, multi-maker
batch, native Subgraph, solver, and web demo pass their gates.

### Post-MVP Research

Treat v4 as an **alternative settlement backend** sharing only protocol-neutral
components:

- curve math and fixed-point libraries;
- canonical position semantics;
- state-transition specification;
- Subgraph entities;
- solver and route format at an abstract level;
- differential and invariant vectors.

Do not share backend-specific state or callbacks. Compare:

1. gas for one, four, and eight maker fills;
2. deposit and withdrawal complexity;
3. storage writes and token transfers;
4. solvency invariants;
5. exact-input/output quote parity;
6. failure isolation and reentrancy surface;
7. router and aggregator integration effort.

Only the benchmark and security model should decide the long-term backend.

## 7. Reconsideration Triggers

Reconsider a hook during the event only if all of the following become true:

- the complete Aqua/SwapVM MVP and demo are already working;
- all mandatory tests, Subgraph, solver, and frontend flows pass;
- substantial protected time remains before feature freeze;
- the Uniswap sponsor explicitly confirms a separate concrete scoring benefit;
- the hook is an isolated adapter or experiment and cannot destabilize the
  primary demo.

Otherwise, keep it as a documented post-hackathon architecture experiment.

## 8. Official References

- Uniswap v4 hooks:
  https://developers.uniswap.org/docs/protocols/v4/concepts/hooks
- Custom accounting and return deltas:
  https://developers.uniswap.org/docs/protocols/v4/guides/custom-accounting
- PoolManager singleton:
  https://developers.uniswap.org/docs/protocols/v4/concepts/poolmanager
- Flash accounting:
  https://developers.uniswap.org/docs/protocols/v4/concepts/flash-accounting
- Uniswap Foundation hook security framework:
  https://github.com/uniswapfoundation/security-framework
- Current ETHGlobal Lisbon prizes:
  https://ethglobal.com/events/lisbon2026/prizes
