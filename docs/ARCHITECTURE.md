# Liquid OB End-to-End Architecture

Status: normative implementation map for the hackathon MVP. This document
identifies every required brick and its boundary; it does not claim that those
bricks are implemented yet. The equations and rounding rules remain normative
in [`MATH_SPEC.md`](MATH_SPEC.md).

## 1. Product Boundary

Liquid OB is a functional order book. A maker publishes one immutable,
two-sided execution policy:

- a sell curve that releases base and receives quote;
- an independently parameterized buy curve that releases quote and receives
  base;
- one bounded marginal-price schedule per side, configured by
  `startPrice`, `endPrice`, and `alpha`;
- an exact `alpha = 0` geometric limit;
- an exact flat-order branch when `startPrice == endPrice`;
- automatic transfer of every received asset into the opposite side;
- homothetic rescaling of a nonempty opposite side and deterministic rearming
  of an empty opposite side.

A taker submits one exact-input or exact-output order. An offchain solver finds
the best split across all indexed positions. One onchain transaction recomputes
every selected fill, checks the complete route, and settles it atomically.

Computationally, every maker position is a **single-maker programmable
micro-pool**: it has its own two token reserves, curve parameters, marginal
state, and capacity. The protocol calls it a `Position`, rather than a `Pool`,
because it has one maker, no pooled ownership, no LP shares, and no common curve
shared with other depositors. The solver nevertheless treats every live side
exactly as an independent liquidity venue.

The MVP deliberately has:

- one curve family rather than maker-provided arbitrary code;
- no oracle dependency;
- no onchain scan over every position;
- no protocol fee;
- no upgradeable proxy or privileged price administrator;
- no protocol custody vault;
- no LP shares or fungible pool ownership;
- no in-place strategy editing.

## 2. System Map

```text
 MAKER PATH

 Maker wallet
    | configure two curves
    v
 Web app -> TypeScript curve compiler -> SwapVM strategy bytes
    | approve Aqua + Aqua.ship(router, strategy, tokens, amounts)
    v
 Aqua virtual allocation + immutable strategy hash


 TAKER PATH

 Web app -> Solver API -> Liquid OB Subgraph ------+
               |                                   |
               +-> RPC refresh + exact SDK quotes  |
               +-> route optimization              |
               +-> eth_call simulation             |
                           |                        |
                           v                        |
                  signed taker transaction          |
                           |                        |
                           v                        |
                 LiquidOBBatchExecutor              |
                           | selected fills         |
                           v                        |
                 LiquidOBSwapVMRouter               |
                   | custom curve opcode            |
                   | runtime transition             |
                   v                                |
                  SwapVM -> Aqua pull/push -> wallets
                           |
                           +-> fill/route events ----+


 DATA AND TOOLING

 Aqua + router + executor events -> The Graph Subgraph
                                      |-> Web history
                                      |-> Solver discovery
                                      +-> Executable Liquidity MCP
                                             + standardized DEX Subgraph
```

## 3. Sources of Truth

The protocol must not treat one database as truth for every concern.

| Concern | Authoritative source | Consequence |
| --- | --- | --- |
| Actual tokens | Maker and taker ERC-20 balances | A transfer failure reverts the entire route. |
| Maker allocation | Official Aqua virtual balances | Aqua is the only allocation and transfer layer. |
| Immutable policy | Aqua `strategyHash = keccak256(strategy)` | Execution always receives and rehashes the exact strategy bytes. |
| Logical curve state | Custom router runtime keyed by maker and strategy hash | This stores executable reserves, domain scales, and version. |
| Active or docked lifecycle | Aqua strategy state | A docked strategy cannot execute even if stale runtime data exists. |
| Global micro-pool universe | Liquid OB Subgraph | One indexed query supplies our own positions and curve states without one RPC read per maker. |
| Candidate route | Untrusted solver | Contracts recompute it; no solver signature grants correctness. |
| User protection | Onchain deadline and aggregate amount limit | A stale or degraded route reverts atomically. |

The router tracks **logical executable reserves** separately from Aqua's
virtual balances. Aqua permits shared allocation and public balance credits;
therefore an unsolicited credit must not silently change a maker's curve.
Execution requires Aqua allocation to cover the logical output, but only a
successful Liquid OB fill changes logical curve state. Manual top-ups are not
an MVP mutation path: the maker docks and republishes a new strategy.

## 4. Canonical Identifiers And Data

### 4.1 Market

`marketId = keccak256(baseToken, quoteToken)` where order is semantic, not
sorted. Every displayed price is quote units per one base unit. Token decimals
are normalized at the SDK and math boundaries.

### 4.2 Position

The onchain key is `(maker, strategyHash)`. A globally portable display ID also
includes `chainId` and the custom router address.

The Aqua strategy is an immutable SwapVM program containing:

- encoding version;
- base and quote token addresses;
- sell-side `startPrice`, `endPrice`, and signed `alpha`;
- buy-side `startPrice`, `endPrice`, and signed `alpha`;
- initial logical reserve for each side;
- numerical-domain commitments;
- a maker-selected salt;
- the custom curve instruction and its immutable arguments.

The token list passed to `Aqua.ship` is `[base, quote]`. The initial base
allocation backs the sell side; the initial quote allocation backs the buy
side. A side may begin empty while retaining enough immutable configuration to
rearm when it next receives inventory.

### 4.3 Runtime State

The custom router keeps one runtime record per `(maker, strategyHash)`:

```text
sellY, sellYInt
buyY,  buyYInt
version
initialized
routeLock / strategyLock as required by the final SwapVM integration
```

`Y` is the logical outgoing reserve. `YInt` is the domain scale used by the
exact coordinate map. Storage widths are selected only after the fixed-point
domain audit; they are not guessed from this document.

An uninitialized record is interpreted from the immutable initial reserves in
the strategy. The first successful fill materializes it. Every successful fill
increments `version`, allowing a route to bind itself to the state it quoted.

## 5. Onchain Bricks

These are logical modules. Gas review may merge libraries into the custom
router, but their responsibilities and tests remain separate.

### 5.1 `CurveTypes.sol`

Defines canonical types for displayed prices, native rates, signed `alpha`,
reserves, domain scales, curve specifications, runtime states, exact-input and
exact-output quotes, fills, and route limits.

It prevents accidental unit mixing. Public structs must identify whether a
rate is displayed quote/base or native output/input.

Protocol dependency: none.

### 5.2 `FullPrecisionMath.sol`

Provides checked multiplication and division with explicit rounding direction,
signed fixed-point conversion, and overflow-safe reserve scaling.

Every output amount rounds against the caller and every required input rounds
up, unless the math specification explicitly names another maker-favorable
rule.

Protocol dependency: none. Any imported math library requires an exact version,
license review, and differential tests before adoption.

### 5.3 `TranscendentalMath.sol`

Provides the bounded `ln`, `exp`, and signed real-power operations required for
arbitrary representable `alpha`. It owns the accepted numerical domains and the
near-singularity policy.

The exact native `alpha = 0`, native `alpha = 1`, and flat branches bypass
unsafe generic divisions. There is no semantic alpha allowlist; rejection may
occur only when a value cannot be represented safely.

Protocol dependency: none, subject to the same imported-library review.

### 5.4 `CurveCompiler.sol`

Converts maker-facing quote/base parameters into the canonical native
output/input representation.

- Buy sides compile directly.
- Sell sides reciprocate both price endpoints and negate maker-facing `alpha`.
- `betaNative` is derived as `alphaNative - 1` and is never maker-selected.
- Equal endpoints compile to the flat branch.

The Solidity compiler and TypeScript compiler must emit byte-identical strategy
arguments for the same canonical input.

Protocol dependency: none.

### 5.5 `CurveMath.sol`

Implements the marginal schedule, integrated bonding curve, inverse coordinate
map, exact-input quote, exact-output quote, current marginal price, post-fill
price, and secant effective price from [`MATH_SPEC.md`](MATH_SPEC.md).

It is pure: no balances, storage, token transfer, Aqua call, or solver logic.

Protocol dependency: none.

### 5.6 `PositionMath.sol`

Applies the two-sided state transition after one pure curve quote.

For a sell-side fill:

1. decrease logical base on the sell side by output base;
2. increase logical quote on the buy side by input quote;
3. rescale both `buyY` and `buyYInt` by the same factor if `buyY > 0`;
4. set `buyY = buyYInt = receivedQuote` if the buy side was empty;
5. preserve buy-side configuration and current marginal price.

The buy-side path is the token-reversed equivalent. The module checks reserve
conservation, domain validity, monotonicity, and the empty-side rule.

Protocol dependency: none.

### 5.7 `PositionCodec.sol`

Canonically encodes and decodes the immutable two-sided policy as a SwapVM
program. It validates version, token order, salt, lengths, and numerical bounds
before returning typed data.

The same bytes are:

- hashed by Aqua;
- shown in the maker preview;
- decoded by the custom instruction;
- decoded by the Subgraph;
- reproduced by the TypeScript SDK.

Protocol dependency: official SwapVM program format.

### 5.8 `PositionRuntime.sol`

Owns the router's logical state mapping and state-version checks. It initializes
from immutable strategy data, rejects mismatched expected versions, applies the
post-fill state, and emits enough pre/post data for independent reconstruction.

This is preferably an internal storage library embedded in the custom router,
not a separately administered contract. Storage commits only on execution;
static quotes use the same transition functions without writes.

Protocol dependency: none directly.

### 5.9 `LiquidCurveInstruction.sol`

Implements the custom SwapVM opcode. It:

1. decodes the two-sided policy;
2. identifies direction from input and output tokens;
3. loads the immutable or current runtime state;
4. validates the quoted `version`;
5. computes exact input or exact output with `CurveMath`;
6. computes both post-trade sides with `PositionMath`;
7. places the computed amounts into SwapVM registers;
8. commits runtime state only on the execution path;
9. emits a canonical `CurveFilled` event.

It never performs final maker/taker transfers itself and never bypasses
SwapVM's amount checks. A downstream settlement failure reverts its state write
and event with the rest of the transaction.

Protocol dependency: official **1inch SwapVM** instruction interface.

### 5.10 `LiquidOBSwapVMRouter.sol`

Is the Aqua app address and the primary single-position execution surface. It
inherits the pinned official SwapVM/Aqua integration and registers the custom
curve opcode in a fixed, reviewed instruction table.

It provides:

- exact-input and exact-output quote paths;
- exact-input and exact-output swap paths;
- strategy-level reentrancy protection;
- token-pair and standard-ERC-20 validation;
- access to runtime state and versions;
- final SwapVM validation followed by Aqua settlement.

Protocol dependencies: official **1inch SwapVM** and **1inch Aqua**. The exact
upstream commit and license must be pinned before implementation. The custom
router is a minimal extension, not a rewrite of Aqua settlement.

### 5.11 `LiquidOBQuoter.sol`

Wraps the router's static quote path and returns product-level details:

- amount in and amount out;
- `pBefore`, `pAfter`, and effective price;
- both sides before and after recycling;
- strategy hash and runtime version;
- a deterministic revert reason when the strategy is stale, docked, exhausted,
  unsupported, or outside the numerical domain.

It quotes only specified positions. It never scans the global order set.

Protocol dependencies: reads Aqua and the custom SwapVM router.

### 5.12 `LiquidOBLens.sol`

Returns one complete live position snapshot from strategy bytes, Aqua state,
and router runtime state. It distinguishes:

- Aqua virtual allocation;
- logical executable reserve;
- maker wallet/allowance availability where queryable;
- ignored surplus credits;
- initialized versus immutable initial state;
- active versus docked lifecycle.

The Lens is for RPC, UI, solver refresh, and diagnostics. Settlement never
trusts a Lens response supplied by a caller.

Protocol dependency: official **1inch Aqua** plus the custom router.

### 5.13 `LiquidOBBatchExecutor.sol`

Executes the solver's bounded route in one transaction. It supports:

- exact input: fixed aggregate input and minimum aggregate output;
- exact output: fixed aggregate output and maximum aggregate input;
- one base/quote market and one direction per batch;
- a hard `maxFills` gas bound;
- one fill per strategy per route;
- expected runtime version for every fill;
- recipient, deadline, and refund recipient;
- authenticated SwapVM callback handling;
- aggregate token conservation and residual refunds;
- atomic rollback if any selected fill or transfer fails.

The executor does not decide which positions are best. It recomputes every fill
through the custom router and checks only a bounded solver proposal.

Protocol dependencies: custom **SwapVM** router and **Aqua** settlement path.

### 5.14 Demo Contracts And Scripts

`MockERC20.sol` and faucet helpers exist only on a public test deployment.
Scripts must deploy the custom router, instruction table, quoter, Lens, batch
executor, and demo tokens; write a chain-specific manifest; seed maker wallets;
approve Aqua; ship representative strategies; and verify contracts where the
network supports verification.

No `PairFactory`, per-position pool, LP NFT, fee controller, treasury, or
protocol vault is needed. `Aqua.ship` is the factoryless position-publication
primitive, and the maker address is the position owner.

## 6. 1inch Integration

### 6.1 Aqua Is Load-Bearing

Liquid OB uses the official Aqua interface as follows:

| Aqua operation | Liquid OB use |
| --- | --- |
| `ship(app, strategy, tokens, amounts)` | Maker publishes immutable SwapVM strategy bytes and virtual base/quote allocations. |
| `safeBalances(...)` | Quote, Lens, and execution validate that the strategy is active and sufficiently allocated. |
| `pull(...)` | The app releases the maker's selected outgoing asset to settlement. |
| `push(...)` | Settlement credits the taker's input asset to the same maker strategy. |
| `dock(...)` | Maker cancels the complete immutable position. |
| `Shipped/Pushed/Pulled/Docked` | The Subgraph reconstructs lifecycle and Aqua allocation changes. |

Tokens remain in the maker wallet until settlement. The maker approves Aqua,
not a Liquid OB vault. Because Aqua permits shared virtual allocation, final
ERC-20 balance and allowance availability is enforced by the actual transfer;
failure reverts the complete batch.

The web app uses the official Aqua SDK for ship/dock transaction construction
and event parsing after the exact SDK version is pinned.

### 6.2 SwapVM Is Load-Bearing

Liquid OB is encoded as a custom SwapVM program rather than a standalone AMM
that merely calls Aqua afterward. The official VM provides the amount-register
model, quote/swap execution framework, program validation, callback surface,
and Aqua settlement mode. Liquid OB adds only the curve instruction and its
runtime accounting.

The custom deployment must preserve official validation and test invariants.
Instruction ordering is immutable after deployment and treated as a security
boundary. Exact-input and exact-output behavior, quote/swap parity,
monotonicity, additivity where applicable, and settlement conservation are all
tested against official SwapVM invariant tooling.

Authoritative upstream references:

- Aqua contracts and documentation: https://github.com/1inch/aqua
- Aqua TypeScript SDK: https://github.com/1inch/sdks/tree/master/typescript/aqua
- SwapVM release branch and documentation: https://github.com/1inch/swap-vm/tree/release/1.1
- ETHGlobal 1inch requirements: https://ethglobal.com/events/lisbon2026/prizes/1inch

## 7. TypeScript Bricks

### 7.1 `packages/curve-math`

A dependency-free mirror of canonical parameter validation, direction
compilation, marginal prices, curve coordinates, exact quotes, effective
prices, recycling, and rounding. Shared test vectors prove parity with Solidity.

This package is used by the web preview, solver, Subgraph tests, and MCP tool.

### 7.2 `packages/position-sdk`

Provides typed strategy builders and decoders, token-decimal normalization,
strategy hash computation, Aqua ship/dock transaction builders, Lens and
Quoter clients, event decoding, and chain-address resolution.

Protocol dependency: pinned official **Aqua SDK** plus generated Liquid OB ABIs.

### 7.3 `packages/contracts`

Contains generated ABIs, typed clients, deployment-manifest schemas, event
types, and no private keys or RPC secrets. Artifacts are generated from the
same contract commit deployed in the demo.

### 7.4 `packages/solver-core`

Implements deterministic candidate filtering and route optimization:

- exact-input output maximization;
- exact-output input minimization;
- convex water-filling over marginal costs;
- exact handling of flat-price levels and deterministic ties;
- per-position reserve and numerical-domain caps;
- route compression and `maxFills` enforcement;
- exact Solidity-equivalent rounding;
- a route certificate containing every pre-state version and expected quote.

The package is pure and independently testable. It does not fetch data or send
transactions.

## 8. Services

### 8.1 `services/solver-api`

This stateless service orchestrates, but never settles, an order:

1. query the Liquid OB Subgraph for our complete active micro-pool universe at
   indexed block `B`;
2. reproduce exact quotes and solve globally over that indexed snapshot;
3. retain the selected fills plus a bounded reserve shortlist;
4. refresh only that shortlist's runtime, Aqua allocation, wallet balance, and
   allowance through batched RPC reads at the current chain head;
5. recompute the route, replacing invalid or stale candidates from the reserve
   shortlist when necessary;
6. run final `eth_call` simulation against `LiquidOBBatchExecutor`;
7. return transparent route details, indexed block, chain-head block, and
   unsigned calldata.

Suggested endpoints are `POST /quote`, `POST /route`, and `GET /health`. Any
caller may reproduce or replace this service. Contracts never authenticate a
preferred solver.

### 8.2 `services/liquidity-mcp`

This is the reusable The Graph sponsor artifact, not a hidden dependency of
settlement. It exposes live tools such as:

- `discover_positions(market, side, amount)`;
- `quote_liquid_ob(market, side, amount)`;
- `compare_executable_liquidity(market, side, amount)`;
- `build_candidate_route(market, side, amount)`.

The comparison tool composes two live Graph-backed sources:

1. the Liquid OB Subgraph with curve-aware executable liquidity;
2. at least one standardized DEX AMM Subgraph for conventional pool liquidity.

It normalizes tokens and price units, states the block used by each source,
and returns structured evidence rather than free-form claims. A public README,
tool schema, runnable example, and short demo video make it reusable outside
the Liquid OB UI.

Protocol dependency: **The Graph Subgraphs**, standardized DEX schemas, and
the official Subgraph MCP tooling where useful.

## 9. The Graph Brick

### 9.1 `subgraph/`

The Liquid OB Subgraph is the live discovery and history layer. Its data sources
are:

- official Aqua `Shipped`, `Docked`, `Pushed`, and `Pulled` events, filtered to
  the custom router app;
- custom router `CurveFilled` and runtime events;
- batch executor `RouteExecuted` events.

Core entities are:

| Entity | Purpose |
| --- | --- |
| `Protocol` | Deployment metadata and aggregate counters. |
| `Market` | Ordered base/quote market and token metadata. |
| `Maker` | Published positions and executed volume by maker. |
| `Position` | Maker, strategy hash, decoded immutable policy, lifecycle, and last runtime version. |
| `CurveSide` | Side parameters, logical reserve, domain scale, and marginal state. |
| `Fill` | Per-position token deltas, prices, effective price, and pre/post version. |
| `Route` | Aggregate exact-in/out execution and its ordered fills. |
| `Token` | Address, decimals, symbol, and normalized volume. |
| `MarketSnapshot` | Time-bucketed volume, active liquidity, and fill counts. |

The Subgraph indexes strategy bytes from Aqua's `Shipped` event, decodes the
canonical program, and derives the initial logical state. Fill events update
that logical state. Aqua events update allocation fields. A dock event marks
the position inactive.

The schema may extend standardized entities where their semantics are honest,
but it must not mislabel maker positions as fungible LP pools. Cross-venue
standardization belongs primarily in the MCP/query adapter, which can map
different venue schemas into one explicit `ExecutableLiquidityVenue` response.

The solver treats Subgraph results as candidate discovery only. A block lag or
mapping bug can cause a stale route to revert, but cannot authorize a bad fill.

### 9.2 Critical Solver Read Path

The first and most important Graph integration is **our own Liquid OB
Subgraph**, not the external standardized-DEX comparison. Every maker position
is materialized as a queryable micro-pool with:

- market, direction, maker, strategy hash, and active/docked status;
- immutable bounds, signed alpha, branch type, and initial commitments;
- current logical `Y`, `YInt`, marginal price, capacity, and runtime version;
- Aqua virtual allocation changes;
- last update block, transaction, and log index.

For one market and side, the Subgraph filters inactive and exhausted positions
and returns all economically eligible `CurveSide` records in one paginated
GraphQL dataset. The TypeScript solver evaluates exact curve math locally and
finds the global split over that snapshot. It does **not** issue an RPC call for
every maker position.

Only the winning fills and a small reserve shortlist are refreshed through an
RPC multicall. This yields the intended complexity:

```text
Without The Graph: N independent RPC state reads + optimization
With The Graph:    one indexed dataset + local optimization + K RPC refreshes
where K is bounded by maxFills plus a small reserve set, and K << N
```

The query records the Subgraph's indexed block through `_meta`. If index lag
exceeds the configured threshold, the solver reports the quote as stale and
waits, switches provider, or uses an explicitly labelled degraded path. It
must not claim best execution at the chain head from an old snapshot.

The second Graph integration, a standardized DEX Subgraph, is used by the
reusable MCP comparison tool. It is not a substitute for indexing Liquid OB's
own micro-pools and is not in the MVP settlement route.

Protocol dependency: **The Graph** hosted/live Subgraph infrastructure and one
standardized DEX AMM Subgraph for the composability demonstration.

Authoritative references:

- Subgraph development: https://thegraph.com/docs/en/subgraphs/developing/creating/starting-your-subgraph/
- Standardized Subgraphs: https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/
- Subgraph MCP: https://thegraph.com/docs/en/subgraphs/tooling/subgraph-mcp/introduction/
- ETHGlobal The Graph requirements: https://ethglobal.com/events/lisbon2026/prizes/the-graph

## 10. Web Application Bricks

### 10.1 Wallet And Network Layer

Connects the maker or taker wallet, enforces the supported chain, resolves the
deployment manifest, reads token balances and allowances, and presents every
transaction step explicitly. RPC URLs and sponsor API secrets never ship in
the browser bundle.

### 10.2 Maker Studio

Lets a maker:

1. select base and quote tokens;
2. configure buy and sell bounds, signed alpha, and initial reserves;
3. see both marginal schedules and integrated cumulative-execution curves;
4. inspect spread, current price, full-range effective price, and failure
   domains;
5. compile and verify canonical SwapVM strategy bytes;
6. approve Aqua for the required tokens;
7. call Aqua `ship` with the custom router as app;
8. wait for transaction and Subgraph confirmation.

The UI must visibly distinguish a flat order, the `alpha = 0` limit, and a
general signed-alpha curve.

### 10.3 Taker Terminal

Lets a taker select market, direction, exact-input or exact-output mode, amount,
slippage, recipient, and deadline. It displays:

- all relevant candidate curves;
- the solver's selected split;
- amount and effective price per maker;
- aggregate output/input and worst marginal price;
- pre/post curves and opposite-side recycled inventory;
- route freshness and simulation result.

The wallet signs only calldata targeting `LiquidOBBatchExecutor`.

### 10.4 Position Manager

Shows immutable policy, logical state, Aqua allocation, wallet backing,
allowances, fill history, and current lifecycle. The only mutation flows are:

- `dock` to cancel completely;
- compile and `ship` a new salted strategy to replace parameters or top up;
- update ERC-20 allowance in the maker wallet.

There is no misleading `edit` or partial-withdraw button in the MVP.

### 10.5 Market Explorer

Uses the Subgraph for live positions, fills, routes, makers, volumes, and
snapshots. It links every item to the originating transaction and states the
indexed block. It is the visible proof that fills change future executable
liquidity.

## 11. End-To-End Flows

### 11.1 Publish A Position

1. Maker enters two curve configurations and reserves.
2. TypeScript validates, compiles direction, encodes the SwapVM program, and
   computes the strategy hash.
3. The UI confirms the Solidity compiler/decoder returns the same hash.
4. Maker approves Aqua for base and quote.
5. Maker calls `Aqua.ship(customRouter, strategy, [base, quote], amounts)`.
6. Aqua records virtual allocations and emits the complete strategy bytes.
7. The Subgraph creates the market, position, and both initial curve sides.

No factory or protocol administrator approves the position.

### 11.2 Discover And Build A Route

1. Taker requests an exact-input or exact-output quote.
2. Solver queries every indexed active micro-pool in that market and direction
   from the Liquid OB Subgraph at block `B`.
3. `solver-core` computes the global split from the indexed curve states and
   keeps a bounded reserve shortlist.
4. Solver refreshes only selected and reserve positions through
   Lens/Aqua/RPC, then recomputes if any are stale, docked, unbacked, exhausted,
   or unsupported.
5. Solver constructs every fill with maker, exact strategy bytes/hash,
   expected runtime version, amount, and limit.
6. Solver simulates the complete batch with `eth_call`.
7. UI shows indexed-block freshness, the route, and unsigned transaction
   calldata.

### 11.3 Execute Exact Input

1. Taker approves the batch executor and signs total input, `minAmountOut`,
   recipient, deadline, and selected fills.
2. Executor authenticates route shape and accounts for total input.
3. For each fill, the custom SwapVM router recomputes output from current state.
4. The custom instruction advances the active side and credits/rescales the
   opposite side.
5. SwapVM checks register amounts and Aqua pulls maker output and pushes taker
   input through the authenticated callback path.
6. Executor sums actual outputs and requires `totalOut >= minAmountOut`.
7. Output reaches the recipient, residual input is refunded, and canonical
   events are emitted.
8. Any failure reverts every token transfer and every runtime mutation.

### 11.4 Execute Exact Output

The flow is symmetric: every fill fixes output, the curve computes required
input rounded up, and the executor requires `totalIn <= maxAmountIn`. Any
unused input allowance or prefunded amount remains with or is refunded to the
taker.

### 11.5 Recycle Inventory

Suppose the sell side releases base and receives quote. The sell curve advances
using its original domain. The received quote is simultaneously added to the
buy side:

- if buy inventory existed, `buyY` and `buyYInt` scale by the same ratio, so
  normalized progress and current marginal price are unchanged;
- if buy inventory was zero, `buyY = buyYInt = receivedQuote`, so it restarts
  at its configured start price.

The corresponding Aqua push credits quote to the same maker strategy. There is
no intermediate generic cash bucket and no keeper transaction.

### 11.6 Cancel Or Replace

1. Maker calls Aqua `dock` for both strategy tokens.
2. Aqua marks the immutable strategy inactive; future safe-balance reads and
   execution fail.
3. The Subgraph marks the position docked.
4. To change parameters or reserve commitments, the maker compiles a new salt
   and calls `ship` again.

Stale runtime storage is harmless because Aqua lifecycle validation is required
for every execution.

## 12. Security Bricks

### 12.1 Numerical Safety

- explicit bounds for prices, endpoint ratios, signed alpha, reserves, and
  intermediate logarithms/exponentials;
- exact singular and flat branches;
- full-precision arithmetic and named rounding direction;
- no swap-time iterative root search;
- invariant and differential tests against a high-precision reference model.

### 12.2 Settlement Safety

- official Aqua transfer path only;
- official SwapVM validation retained;
- custom callback authentication;
- per-strategy and route-level reentrancy protection;
- one strategy occurrence per batch;
- expected state versions, deadline, and aggregate slippage;
- hard maximum fill count;
- standard ERC-20 allowlist/validation for the demo;
- complete transaction rollback on insufficient wallet balance, allowance, or
  virtual allocation.

### 12.3 Trust Minimization

- solver is replaceable and untrusted;
- Subgraph is not settlement truth;
- maker policy is hash-committed and immutable;
- no admin can change a curve or price;
- no oracle can settle a different result;
- no backend signs on behalf of maker or taker;
- deployment addresses and upstream commits are published in manifests.

## 13. Verification Bricks

| Layer | Required verification |
| --- | --- |
| Math | Unit vectors for signed alpha, exact `0`, native `1`, flat orders, boundaries, inverses, and rounding. |
| Differential | Solidity and TypeScript against an independent high-precision model. |
| Fuzz/invariants | Monotonicity, domain preservation, quote/swap parity, conservation, rescaling, and rearming. |
| SwapVM | Official core invariants plus custom-opcode exact-in/out and static/execution parity. |
| Aqua | Fork/integration tests using real `ship`, `pull`, `push`, `dock`, approvals, and ERC-20 transfers. |
| Runtime | First-fill initialization, version races, unsolicited Aqua credit, docked state, and rollback after failed transfer. |
| Batch | Multi-maker optimal route, slippage, deadline, duplicate strategy, max fills, callback spoofing, and atomic revert. |
| Solver | Brute-force comparison on small sets, deterministic ties, flat orders, caps, stale candidates, and gas-aware compression. |
| Subgraph | Event-to-entity mapping tests, strategy decoding, reorg/idempotency handling, and indexed/onchain reconciliation. |
| Web | Maker publish, taker route, execute, recycle, dock, wrong network, rejected wallet transaction, and stale route E2E. |

## 14. Deployment And Operations Bricks

### 14.1 Dependency Pinning Gate

Before importing code, record exact Aqua, SwapVM, SDK, math-library, and The
Graph versions in `PROVENANCE.md`; review their licenses; vendor or lock them;
and preserve upstream notices. No moving branch is a deployment dependency.

### 14.2 Network Profiles

Two profiles avoid pretending that an official contract exists on an
unsupported testnet:

- integration profile: local fork of a network with official Aqua deployment,
  used for official-contract tests and a deterministic fallback demo;
- public demo profile: a Graph-supported public chain using either an official
  Aqua deployment or a rules- and license-compliant deployment of the pinned
  official contracts, plus the custom router.

The selected profile is fixed only after a deployment spike proves Aqua,
SwapVM, RPC, explorer, wallet, faucet/assets, and The Graph compatibility.
Local forks are not sufficient for the live Subgraph demonstration, so the
public profile remains a required milestone.

### 14.3 Deployment Manifest

`deployments/<chainId>.json` records chain, deployment block, exact commit,
Aqua address, custom router, quoter, Lens, executor, demo tokens, Subgraph URL,
RPC/explorer metadata, and verification links. Web, SDK, solver, scripts, and
Subgraph all consume the same validated schema.

### 14.4 Runtime Operations

- solver and MCP health endpoints;
- RPC fallback and timeouts;
- Subgraph indexed-block lag surfaced in UI;
- seeded maker wallets and repeatable demo-reset script;
- deterministic transaction links and a local-fork fallback recording;
- no private key, API key, or sponsor credential committed to Git.

## 15. Sponsor Mapping

| Sponsor | Actual product brick | Why it is meaningful |
| --- | --- | --- |
| 1inch Aqua | Position publication, virtual allocation, maker-wallet settlement, cancellation, and lifecycle events | Liquid OB cannot publish or settle a position without Aqua. |
| 1inch SwapVM | Canonical strategy program, custom curve opcode, quote/swap register execution, validation, and Aqua mode | The curve is a native programmable SwapVM position, not a cosmetic API call. |
| The Graph | Our complete micro-pool state, live position discovery for the solver, market history, and route/fill analytics | One indexed dataset replaces one RPC read per maker and makes global route search operationally realistic. |
| The Graph MCP/standardized data | Reusable curve-aware liquidity tools composed with a standardized DEX source | The artifact exposes a new executable-liquidity model beyond the application UI. |
| Uniswap Foundation | Submission documentation only: public repository, completed `FEEDBACK.md`, feedback form, and identifying eligibility note | Written sponsor-specific confirmation removes the runtime API requirement; no artificial Uniswap dependency belongs in settlement. |

World, Sui, Hedera, 0G, ENS, and other sponsor protocols are not architecture
bricks for this MVP. Adding them would weaken rather than complete the product.

A Uniswap v4 custom-accounting hook is a viable alternative settlement design,
but not an additional MVP brick and not a wrapper around Aqua. Its custody,
solvency, gas, security, and bounty tradeoffs are evaluated separately in
[`UNISWAP_V4_HOOK_EVALUATION.md`](UNISWAP_V4_HOOK_EVALUATION.md).

## 16. Workspace Target

```text
contracts/
  src/math/                 pure fixed-point and curve libraries
  src/codec/                strategy compilation and encoding
  src/swapvm/               custom instruction and router
  src/periphery/            quoter, Lens, and batch executor
  script/                   deploy, seed, ship, dock, and demo scripts
  test/                     unit, fuzz, invariant, integration, and fork tests

packages/
  curve-math/               exact TypeScript math mirror
  position-sdk/             strategy and Aqua lifecycle SDK
  contracts/                generated ABIs and deployment clients
  solver-core/              pure route optimizer

services/
  solver-api/               discovery, refresh, optimize, simulate, calldata
  liquidity-mcp/            reusable The Graph liquidity tools

subgraph/                   schema, mappings, tests, and deployment config
apps/web/                   maker, taker, manager, and explorer interface
deployments/                chain manifests
docs/                       math, architecture, security, demo, and submission
```

## 17. Implementation Order And Gates

1. **Pin and prove dependencies.** Resolve licenses, exact commits, target
   network, official Aqua fork, custom SwapVM compilation, and one real token
   transfer before building UI.
2. **Freeze math.** Implement pure Solidity math and pass deterministic,
   differential, fuzz, inverse, and boundary tests.
3. **Freeze encoding.** Implement canonical strategy bytes and prove Solidity
   and TypeScript hash parity.
4. **Prove one native position.** Ship through Aqua, quote and execute one
   direction through the custom SwapVM opcode, then dock.
5. **Prove two-sided recycling.** Execute both directions, rescale/rearm the
   opposite side, and verify logical state plus Aqua transfers.
6. **Prove atomic routing.** Execute exact-input and exact-output batches across
   at least two makers with stale-route and rollback tests.
7. **Ship SDK and solver.** Match Solidity bit-for-bit, beat brute-force test
   cases, simulate final calldata, and expose a transparent route.
8. **Ship live data.** Deploy the Subgraph, reconcile events with Lens state,
   and make solver discovery depend on it.
9. **Ship the product UI.** Complete maker publish, taker route/execute,
   position dock/replace, and explorer flows without console intervention.
10. **Ship the reusable Graph tool.** Compose Liquid OB and standardized DEX
    data through documented MCP tools and record the required tool demo.
11. **Harden and rehearse.** Run full CI, security tests, deployment manifests,
    contract verification, demo resets, transaction evidence, and fallbacks.
12. **Complete submission obligations.** Finalize README, architecture links,
    sponsor matrix, videos, `FEEDBACK.md`, Uniswap feedback form, and identifying
    eligibility note.

No later brick may compensate for a failed earlier gate. In particular, the
web interface, Subgraph, or sponsor tooling cannot make an unverified curve or
non-atomic settlement safe.

## 18. MVP Definition Of Done

The architecture is implemented only when a judge can observe this complete
sequence with real contract calls:

1. at least three makers publish distinct two-sided curve strategies through
   official Aqua/SwapVM infrastructure;
2. The Graph discovers all live positions;
3. a taker asks for one amount and sees a solver split across multiple makers;
4. one transaction settles all selected fills with aggregate slippage checks;
5. each active side advances and every received asset appears on its opposite
   curve without a keeper;
6. a second quote changes because the executable state changed;
7. the Subgraph and MCP expose the new state and transaction evidence;
8. exact-input, exact-output, flat-order, alpha-zero, signed-alpha, recycling,
   stale-route, and atomic-revert tests all pass.

Anything less is a useful prototype, but not the complete Liquid OB hackathon
product described by this architecture.
