# Liquid OB Product and Protocol Specification

## 1. Product

Liquid OB is a functional order book. A maker does not publish only a price and
volume; the maker publishes a bounded execution policy describing how marginal
price changes as inventory is consumed.

One maker position contains two sides:

- A sell curve holding base inventory and receiving quote inventory.
- A buy curve holding quote inventory and receiving base inventory.

The sides can use different prices, volumes, and `alpha` values. Their starting
prices define the maker's spread. They are economically connected by automatic
inventory recycling, but no rule forces their marginal prices to meet.

## 2. One Marginal-Shape Family

Every side uses the same user-facing configuration:

```text
Curve(startPrice, endPrice, alpha, reserve)
```

`startPrice` is the marginal price before any inventory on the current scale is
consumed. `endPrice` is the terminal marginal price. `reserve` is the currently
available outgoing asset. Prices are displayed in quote per base. `alpha`
controls how liquidity density is distributed between the endpoints.

Let `t` be normalized outgoing-inventory consumption, from `0` at the starting
point to `1` at the terminal point. On a sell side it measures base sold; on a
buy side it measures quote spent. The marginal price is:

```text
P_alpha(t) = ((1-t) * startPrice^alpha
              + t * endPrice^alpha)^(1/alpha)             if alpha != 0

P_0(t)     = startPrice^(1-t) * endPrice^t                 if alpha = 0
```

`P_alpha(t)` is the maker-facing marginal-price schedule, not the token-reserve
bonding curve. The actual bonding curve is obtained by compiling this schedule
to native output-per-input units and integrating its reciprocal. Quotes use the
resulting closed-form coordinate functions, never the marginal schedule as if
it were an invariant.

There are no named curve modes. Positive, zero, and negative `alpha` values are
members of one family. Solidity represents `alpha` as signed WAD fixed point.
The protocol applies numerical domain bounds for safe `pow`, `exp`, and `ln`,
but does not maintain a semantic whitelist of shape values.

`alpha = 0` is evaluated directly as the continuous geometric limit. It is not
approximated with a small nonzero value. The direction-normalized evaluator also
has an exact continuous path at native `alpha = 1`. These are analytical
branches, not additional maker-facing curve types.

Every endpoint price must be strictly positive. A buy side requires
`startPrice > endPrice`; a sell side requires `startPrice < endPrice`. Equal
prices select the flat-order extension. This ensures the maker's displayed
price becomes no better for the taker as inventory is consumed.

The complete formulas, domains, exact swap maps, and direction transforms are
normative in `docs/MATH_SPEC.md`.

## 3. Canonical Direction and Displayed Prices

Every market has a canonical base token and quote token. The interface always
displays price as quote units per base unit. The native kernel instead uses
outgoing token per incoming token and distinguishes marginal from effective
rate:

```text
P_native_marginal = -dy / dx
P_native_effective = -deltaY / deltaX
```

- A buy side releases quote and receives base, so its displayed rate is already
  native. It keeps the endpoints and `alpha` unchanged.
- A sell side releases base and receives quote, so its native rate is reciprocal.
  The compiler reciprocates both endpoints and negates displayed `alpha`.

The sell-side sign change follows exactly from Holder reciprocity:

```text
1 / P_alpha(t; startPrice, endPrice)
    = P_{-alpha}(t; 1/startPrice, 1/endPrice)
```

Therefore both sides execute through one canonical kernel while the maker and
UI continue to reason in quote per base. Every compiled side satisfies
`0 < PLow < PHigh`; its native output-per-input marginal rate decreases as its
outgoing reserve is consumed.

The conjugate coordinate uses `betaNative = alphaNative - 1`. This second
symbol is derived, never maker-selected. The relation is required for the
reserve and conjugate coordinate functions to be exact mutual inverses.

For one finite fill, let `pBefore` and `pAfter` be its displayed marginal
prices. Its curve-only displayed effective price is:

```text
buy:  D_up_alpha(pBefore, pAfter)
sell: D_down_alpha(pBefore, pAfter)
```

The configured `startPrice` and `endPrice` are used in this formula only when a
fresh side is traversed completely. Partial fills always use their actual
pre-fill and post-fill marginal prices. User-facing all-in execution also
reports any fees separately from this curve-only effective price.

## 4. Flat Order Limit

When `startPrice == endPrice == price`, the curve is a standard order-book
position:

```text
price  = constant
volume = reserve
```

The execution engine bypasses powers and logarithms:

```text
inputRequired = outputRequested / nativeRate
outputGiven   = inputProvided * nativeRate
```

`nativeRate` is outgoing token per incoming token after direction compilation.
Token decimals are normalized before these operations. Required input rounds
up; delivered output rounds down. The flat encoding canonicalizes economically
irrelevant shape fields so identical flat orders have one program hash.

This equal-endpoint behavior is an explicit continuous extension of the strict
bounded family. It is not part of the non-flat encoding and never evaluates a
`0/0` range parameter.

## 5. Encoded and Runtime State

The direction-normalized non-flat side uses the reduced native encoding:

```text
E = (y, yInt, alphaNative, mu, kappa)
```

`alphaNative` is the direction-compiled shape parameter. `mu` is dimensionless
range and `kappa` is rate scale. `gamma = abs((alphaNative-1)/alphaNative)` is
derived except at its exact singular paths. Boundary rates are recoverable from
`(alphaNative, mu, kappa)`.

`y` is the live outgoing-token balance allocated to the position in Aqua.
`yInt` is mutable runtime scale in the Liquid OB app. Keeping runtime scale in a
state store does not introduce a custody vault: tokens remain in Aqua.

For a normal freshly armed side, `y == yInt` and progress is zero. As that side
executes, `y` decreases while `yInt` stays fixed, so progress increases:

```text
t = 1 - y / yInt
```

Price bounds and current marginal price are reconstructed views. Raw token
decimals never enter the curve math; the SDK and settlement boundary normalize
amounts into WAD units. Funding, withdrawal, recycling, and fills are the only
authorized balance-changing paths and update Aqua plus runtime state in one
atomic operation.

The derived incoming-token coordinate `xE(y)` and exact inverse `yE(x)` provide
closed-form swaps:

```text
exact output: amountIn  = xE(y - amountOut) - xE(y)
exact input:  amountOut = y - yE(xE(y) + amountIn)
```

The five sign-safe internal evaluator regions are native `alpha > 1`,
`alpha = 1`, `0 < alpha < 1`, `alpha = 0`, and `alpha < 0`. They implement one
continuous family and are all covered by differential tests.

## 6. Two-Sided Position State

```text
Position {
    maker
    baseToken
    quoteToken
    sellCurve
    buyCurve
    nonce
    active
}
```

The sell curve outputs base and receives quote. The buy curve outputs quote and
receives base. Both balances belong to the same maker strategy in Aqua. Liquid
OB does not place maker inventory in a separate protocol vault.

Static position parameters are immutable for one nonce; only reserves, domain
scales, and activity status evolve. A maker parameter update cancels the old
nonce and publishes a replacement. This prevents a quote from silently changing
shape between simulation and execution.

## 7. Execution and Automatic Recycling

When the sell curve executes:

1. The taker provides quote input.
2. The sell curve computes and releases base output.
3. The sell reserve `ySell` decreases, its displayed ask rises, and its native
   output-per-input rate falls.
4. The complete quote input is credited to the maker's buy-curve reserve.
5. The buy curve is rescaled without moving its current marginal price.

The reverse path is symmetric: executing the buy curve spends quote, receives
base, and credits that base to the sell curve.

Using `B` for base reserve and `Q` for quote reserve, conservation is explicit:

```text
sell fill: B_sell_after = B_sell_before - baseOut
           Q_buy_after  = Q_buy_before  + quoteIn

buy fill:  Q_buy_after  = Q_buy_before  - quoteOut
           B_sell_after = B_sell_before + baseIn
```

For a nonempty opposite curve:

```text
received     = active input
yAfter       = yBefore + received
scale        = yAfter / yBefore
yIntAfter    = yIntBefore * scale
```

Because `y` and `yInt` scale by the same factor, `y / yInt`, current marginal
price, endpoints, and `alpha` remain unchanged. The curve gains executable
volume without jumping in price. Its conjugate coordinate scales by the same
factor, so the complete curve is homothetically enlarged rather than merely
having its balance patched.

If the opposite curve is empty, proportional scaling is undefined. The protocol
rearms it deterministically at its committed starting point:

```text
yAfter    = received
yIntAfter = received
tAfter    = 0
```

For a flat side, recycling only increases constant-price volume. Every state
transition checks that the credited amount equals the active input exactly.
There is no unallocated intermediate maker balance and no double credit.

The MVP charges no protocol fee, so "complete input" is literal. A future fee
module must define the fee before quoting and recycle only the explicitly
reported net maker receipt; silently subtracting value from the opposite curve
is forbidden.

The two-sided recycling rule is a Liquid OB composition layer over two valid
single curves. It does not claim that the pair has an additional shared
bonding-curve invariant.

## 8. Position Lifecycle

The maker workflow is:

1. Choose tokens and independently configure buy and sell sides.
2. Preview both curves, spread, maximum execution, and resulting encodings.
3. Approve the required tokens and publish the Aqua-backed position.
4. Allow partial fills in either direction with automatic recycling.
5. Cancel immediately by invalidating the nonce and releasing unused balances.
6. Replace parameters through a new nonce and strategy hash.
7. Withdraw both remaining inventories when closing the position.

There are no LP shares. Each maker owns and controls one explicit strategy.

## 9. Solver

An EVM transaction cannot scan every position onchain without unbounded gas.
Discovery and optimization therefore happen offchain, while correctness remains
onchain.

For an exact-output request `Y`, the solver minimizes:

```text
minimize    sum(input_i(output_i))
subject to  sum(output_i) = Y
            0 <= output_i <= liveReserve_i
```

For exact input, it maximizes aggregate output under the input budget. Flat
orders behave like conventional order-book levels. Curved positions contribute
continuous marginal liquidity. Native `P = output/input` decreases as reserve
is consumed, so marginal cost `1/P` is nondecreasing and each exact-output cost
is convex. The solver can water-fill against a common marginal cost, clipping
each position at zero or its live reserve. Flat orders are constant-cost
intervals, with deterministic tie-breaking and fixed-point correction at the
final allocation.

Solver flow:

1. Query The Graph for every indexed active Liquid OB position in the requested
   market and direction at indexed block `B`. Each position is an independent
   single-maker programmable micro-pool for routing purposes.
2. Reproduce exact Solidity quotes, including rounding, and optimize globally
   over that indexed snapshot in the TypeScript SDK.
3. Keep the selected fills plus a bounded reserve shortlist and refresh only
   those runtime versions, logical reserves, Aqua allocations, wallet balances,
   and allowances through batched RPC reads.
4. Recompute the final split and discard stale or unavailable candidates.
5. Simulate the complete batch with `eth_call`.
6. Submit only selected fills with aggregate slippage and deadline constraints.

The Graph is therefore load-bearing for Liquid OB's own order set. It replaces
an unbounded sequence of per-position RPC reads with one indexed dataset; the
RPC refresh is bounded by `maxFills` plus a small reserve set. External
standardized Subgraphs are additional comparison inputs for the MCP artifact,
not substitutes for the native Liquid OB Subgraph.

The solver is untrusted. It can propose a poor route but cannot bypass reserve,
price, version, token, deadline, or slippage checks. "All pools" means all
eligible Liquid OB positions discovered for that market; external protocols
require explicit quote and settlement adapters and are not silently assumed.

## 10. Atomic Settlement

`LiquidOBBatchExecutor` accepts a bounded list of selected fills. A maximum
fill count makes gas predictable. For each fill it verifies:

- Active Aqua strategy and current runtime version.
- Expected token orientation.
- Live logical reserve, sufficient Aqua allocation, and valid curve domain.
- Exact-input or exact-output quote.
- Opposite-side credit and rescaling.
- Per-fill and aggregate amount constraints.

All fills settle through the custom SwapVM path. A batch has one market and one
direction, so freshly recycled opposite-side inventory cannot be recursively
consumed inside the same route. Fills execute in committed order and each next
fill observes the preceding post-state. Any failed fill reverts the entire
route. State checks follow checks-effects-interactions ordering and reentrancy
protection before external token movement.

## 11. Onchain Modules

| Module | Responsibility |
| --- | --- |
| `CurveTypes` | Native `E` state, signed `alpha`, quote results, errors |
| `FullPrecisionMath` | Full-precision fixed-point arithmetic and directional rounding |
| `TranscendentalMath` | Checked `pow`, `exp`, and `ln` over explicit domains |
| `CurveCompiler` | Displayed buy/sell parameters to canonical native state |
| `PositionCodec` | Canonical two-sided SwapVM strategy encoding and decoding |
| `CurveMath` | Exact-input/output traversal and flat-order branch |
| `PositionMath` | Active mutation, opposite credit, rescale, and rearm |
| `PositionRuntime` | Router-owned logical reserves, scales, and state versions |
| `LiquidCurveInstruction` | Custom SwapVM curve quote and state-transition opcode |
| `LiquidOBSwapVMRouter` | Aqua app, SwapVM validation, and single-position settlement |
| `LiquidOBQuoter` | Static single-position product-level preview |
| `LiquidOBLens` | Strategy, runtime, Aqua, wallet, and allowance reconciliation |
| `LiquidOBBatchExecutor` | Atomic multi-position settlement and aggregate limits |

## 12. Offchain Modules

| Module | Responsibility |
| --- | --- |
| Curve math package | Exact TypeScript math and rounding mirror |
| Position SDK | Compile, decode, normalize decimals, Aqua lifecycle, and calldata |
| Solver core | Pure deterministic route optimization |
| Solver API | Discover, refresh, optimize, simulate, and return unsigned routes |
| Liquid OB Subgraph | Index markets, positions, both curve states, and fills |
| Liquidity MCP | Reusable live discovery and comparison tools |
| Web application | Maker builder, taker execution, position management |

The precise module boundaries, protocol calls, flows, and deployment order are
specified in [`ARCHITECTURE.md`](ARCHITECTURE.md).

The Graph is the discovery index, not settlement truth. Stale indexed data can
cause a candidate to be omitted or a transaction to revert, but cannot authorize
an invalid fill.

## 13. Interface

The maker screen shows both curves on one chart, the visible spread, inventory
on each side, `alpha`, current marginal prices, and the effect of a simulated
fill. Equal endpoints automatically switch the side into a familiar limit-order
editor showing only price and volume.

The taker screen shows requested amount, candidate positions, optimized split,
blended price, worst marginal price, price impact, minimum output or maximum
input, and the pre/post state of every selected position. The demo highlights
received inventory appearing immediately on the opposite curve.

## 14. Events and Indexed Data

Canonical lifecycle and indexing events are split by authority:

- Aqua `Shipped`, `Docked`, `Pushed`, and `Pulled` describe immutable strategy
  publication, cancellation, and allocation changes.
- Liquid OB `PositionRuntimeInitialized` materializes logical initial state.
- Liquid OB `CurveFilled` contains route linkage, amounts, prices, and complete
  two-sided pre/post runtime state.
- Liquid OB `RouteExecuted` contains aggregate route amounts and limits.

The Subgraph derives published, cancelled, replaced, advanced, rescaled, and
flat-fill entities from those canonical events instead of charging gas for
redundant labels. Exact event fields are frozen in `docs/WIRE_FORMAT.md`.

The standardized schema exposes `Market`, `Maker`, `Position`, `CurveState`,
`Route`, and `Fill`. The solver and UI consume live indexed candidates, while a
reusable MCP exposes `discoverPositions`, `compareExecution`, and `buildRoute`.

## 15. Correctness and Security

The required test matrix covers:

- Positive, negative, zero, and numerically extreme safe `alpha` values.
- Exact continuous limits and continuity around native `alpha = 0` and `1`.
- Exact flat orders with equal endpoint prices.
- Quote/execution equality and exact-input/output near-inversion.
- Price and domain monotonicity.
- Split versus sequential path consistency.
- Active reserve conservation and exact opposite-side credit.
- Marginal-price preservation under nonempty rescaling.
- Deterministic empty-side rearming.
- Multi-position atomicity and aggregate conservation.
- Stale nonces, cancellations, balance changes, slippage, and deadlines.
- Reentrancy, malicious tokens, malformed programs, and overflow domains.
- Differential vectors against a high-precision independent model.
- Correct buy identity and sell reciprocal/sign-flip compilation.
- Effective-rate equality with the power-difference mean.
- Real token transfers through official Aqua/SwapVM contracts.
- Direct or unexpected balance changes cannot desynchronize `y` and `yInt`;
  unsupported mutations revert until processed through an explicit sync rule.

The hackathon deployment supports standard ERC-20 tokens only. Rebasing,
fee-on-transfer, callback-bearing, and otherwise nonstandard assets are rejected
or explicitly unsupported.

## 16. Deployment and Operations

The deployment is assembled in dependency order:

1. Pin and license-review the exact official Aqua and SwapVM commits.
2. Deploy or reference the official settlement contracts for the target chain.
3. Deploy fixed-point libraries, curve instruction, app, state store, quoter,
   executor, and directory with immutable dependency addresses.
4. Grant only the minimum app capabilities and transfer production ownership to
   a documented multisig or timelock; the demo uses clearly labelled keys.
5. Publish contract addresses and ABIs in one versioned deployment manifest.
6. Deploy the Subgraph from those addresses and wait for a verified live sync.
7. Start a stateless solver against the manifest, Subgraph endpoint, and RPC.
8. Build the web application with public addresses only; API keys remain in the
   server environment and never enter the browser bundle.
9. Seed three maker positions, run the end-to-end smoke test, and record the
   reproducible reset procedure used for the demo.

Operational monitoring tracks failed routes, stale-index lag, solver/onchain
quote differences, Aqua balance mismatches, and position lifecycle events. The
hackathon deployment is explicitly not represented as audited or suitable for
uncapped value.

## 17. Sponsor Mapping

1inch is the settlement architecture: maker balances use official Aqua and the
curve/recycling transition executes through a custom SwapVM instruction.

The Graph is the load-bearing discovery architecture: the solver finds live
positions through the Subgraph, and the standardized schema plus reusable MCP
supports cross-source executable-liquidity comparison.

Uniswap requires no protocol adapter under the project-specific written
eligibility confirmation. The deliverables are an honest `FEEDBACK.md`, the
feedback form, the identifying submission note, a public repository, and an
explicit open-source license.

## 18. Demo Definition of Done

The seeded market contains three makers:

- One conventional flat price-and-volume position.
- One position concentrated near its starting price.
- One position distributing inventory deeper across its range.

The taker submits one order that the solver splits across at least two makers.
One transaction settles the route. The active curves advance, received assets
appear on the opposite curves, wallet/Aqua balances change, and The Graph shows
the indexed fills. The same flow must work twice from a documented seeded state
without console intervention.
