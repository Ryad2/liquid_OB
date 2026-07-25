# Liquid OB Hackathon Execution Plan

## 1. Mission

Build the smallest complete proof that a functional order book is useful:

> Liquid OB is an order book where each maker position is a two-sided,
> self-recycling execution policy. A solver routes one taker order across
> competing positions, and the resulting fills settle from self-custodied
> 1inch Aqua balances.

The project wins by making this claim visible in one transaction, not by
shipping the largest protocol. The live demo must show three two-sided maker
positions with different bounds and `alpha`, a better split than any single
position, automatic inventory recycling, actual token transfers, and indexed
post-trade state.

## 2. Definition of success

The core is demo-ready only when all of the following are true:

1. A maker can define, validate, fund, publish, replace, and cancel a two-sided
   position containing one sell curve and one buy curve.
2. A taker can request exact-input and exact-output quotes from a single curve.
3. A solver can compare live curves and split one order across at least three
   maker positions.
4. One atomic transaction enforces aggregate slippage and settles every fill
   through official Aqua or SwapVM contracts.
5. The UI shows the curve, selected fills, blended execution price, expected
   balance changes, transaction hash, and indexed fill history.
6. Unit, fuzz, invariant, and end-to-end tests are green from a fresh clone.
7. A four-minute demo can be completed twice without manual repair.
8. Every execution transfers the received asset into the opposite curve and
   rescales that curve without changing its current marginal price.
9. `startPrice == endPrice` executes as an exact flat price-and-volume order.

This remains hackathon software. Audit, formal verification, economic stress
testing, and production operations are explicitly outside the submission claim.

## 3. Frozen MVP

### In scope

- Two-sided maker positions. Each position contains an independently
  parameterized sell curve and buy curve with a maker-defined spread.
- One continuous curve family parameterized by signed `alpha`; there are no
  maker-facing curve modes or whitelisted shape values.
- Exact native `alpha = 0` and `alpha = 1` continuous limits required by the
  reduced closed-form evaluator.
- An exact flat-order branch when `startPrice == endPrice`, reducing the
  position side to one price and one available volume.
- Reduced native state `(y, yInt, alphaNative, mu, kappa)`, with immutable
  shape fields, non-custodial runtime scale, and closed-form quotes.
- Automatic cross-curve inventory recycling and deterministic homothetic
  rescaling after every fill.
- Exact price bounds and marginal-price reconstruction with maker-favorable
  rounding at token-transfer boundaries.
- Aqua-backed maker inventory and a custom SwapVM instruction/router if the
  official contracts and license permit the intended extension.
- Offchain discovery and route optimization followed by exact onchain
  validation and atomic execution.
- A live The Graph index for discovery, fills, and analytics.
- A focused maker and taker interface.

### Explicitly out of scope

- LP shares, fungible shared pools, pair factories, and forced bid/ask symmetry.
- Piecewise-linear approximations of the core curve.
- Arbitrary maker-provided bytecode or unrestricted mathematical expressions.
- Oracles as a settlement dependency. Makers quote prices; arbitrage and the
  solver align competing liquidity with external markets.
- Governance, protocol fees, bridges, multichain deployment, margin, leverage,
  liquidations, and production admin systems.
- Superficial integrations added only to increase the number of prize logos.

## 4. Order semantics and math

The complete formulas are specified in `docs/MATH_SPEC.md`; product transitions
and module boundaries are in `docs/PRODUCT_SPEC.md`. Each side is configured
from displayed quote-per-base values:

```text
(startPrice, endPrice, alpha, reserve)
```

For normalized outgoing-inventory consumption `t` in `[0, 1]`, the single
maker-facing marginal schedule is:

```text
P_alpha(t) = ((1-t) * startPrice^alpha
              + t * endPrice^alpha)^(1/alpha)             if alpha != 0

P_0(t)     = startPrice^(1-t) * endPrice^t                 if alpha = 0

P_flat(t)  = startPrice                                   if startPrice = endPrice
```

On sells, `t` is base sold; on buys, `t` is quote spent. `P_alpha(t)` is not
the bonding curve. The settlement curve is the integral coordinate
`x(t) = yInt * integral(1/P(t))`, represented onchain by `xE(y)` and its exact
inverse `yE(x)`.

Every non-flat `alpha` is accepted if its signed fixed-point representation and
the resulting powers remain inside explicit numerical safety domains. There is
no semantic allowlist. `alpha = 0` is evaluated by its continuous geometric
limit, never by division by zero. A buy side compiles directly to native
output-per-input rate. A sell side reciprocates both prices and negates `alpha`.
The reduced evaluator handles native `alpha = 0` and `alpha = 1` exactly. The
flat branch bypasses shape math with directional rounding.

The conjugate parameter is derived as `betaNative = alphaNative - 1`; it is not
maker-selected. Swaps evaluate the closed-form coordinate `xE(y)` and inverse
`yE(x)`, not an approximate segmented curve or swap-time root search.

For a partial fill, effective price is the secant rate between its actual
pre-fill and post-fill states. In displayed units this is
`D_up_alpha(pBefore, pAfter)` for buys and
`D_down_alpha(pBefore, pAfter)` for sells. Configured boundary prices apply
only to a complete fresh-side traversal.

When one side executes, its reserve decreases and its progress advances toward
`endPrice`. The entire input asset is credited to the opposite side. If the
opposite reserve was nonzero, both its reserve and domain scale are multiplied
by the same factor, preserving normalized progress, `alpha`, bounds, and current
marginal price. If it was empty, it deterministically rearms at its committed
`startPrice`. No asset waits unallocated in a generic position balance.

## 5. Architecture

### Settlement layer

- `CurveCompiler` and `PositionCodec`: compile displayed buy/sell parameters,
  validate numerical domains, and encode the canonical two-sided SwapVM
  strategy.
- `CurveMath`: implements one continuous `alpha` family, its exact analytical
  limits, and the degenerate flat-order path over compact curve state.
- `FullPrecisionMath` and `TranscendentalMath`: provide checked fixed-point
  arithmetic, directional rounding, powers, logarithms, and exponentials.
- `LiquidCurveInstruction`: custom SwapVM instruction that decodes the compact
  curve state, reads logical runtime state, computes a fill, updates SwapVM
  registers, and commits the two-sided transition on successful execution.
- `PositionMath`: applies the active-curve transition, credits the full input to
  the opposite curve, rescales it, and validates the two post-trade states.
- `PositionRuntime`: router-owned logical reserves, mutable domain scales, and
  state versions; it is an internal storage module rather than a custody layer.
- `LiquidOBSwapVMRouter`: the Aqua app and custom SwapVM deployment; it retains
  official SwapVM validation and delegates final transfer settlement to Aqua.
- `LiquidOBQuoter` and `LiquidOBLens`: static single-position previews and full
  reconciliation of strategy bytes, logical state, and Aqua allocation.
- `LiquidOBBatchExecutor`: executes multiple selected position fills atomically
  and enforces aggregate conservation and slippage.

Maker wallets contain the actual assets, Aqua is authoritative for virtual
allocation and lifecycle, and router storage is authoritative for logical curve
inventory. Liquid OB introduces no parallel custody vault. Strategy bytes are
immutable and included in Aqua `Shipped` events; runtime scales evolve
atomically with fills, while parameter or reserve updates use a
dock-and-republish lifecycle. The complete boundary and brick map is normative
in [`ARCHITECTURE.md`](ARCHITECTURE.md).

### SDK and solver

- Compile both `(startPrice, endPrice, alpha, reserve)` sides, token direction,
  and decimals into a canonical position program and strategy hash.
- Reproduce contract quotes exactly in TypeScript, including rounding.
- Discover candidate positions, validate their current onchain state, and
  optimize allocations using each curve's exact quote function.
- Re-quote the final route onchain immediately before building calldata.
- Return a transparent route: maker, input, output, `alpha`, `pBefore`,
  `pAfter`, and effective price for every fill.

For exact output `Y`, the solver minimizes the sum of the exact curve input
functions subject to reserve domains:

```text
minimize    sum(deltaX_i(deltaY_i))
subject to  sum(deltaY_i) = Y
            0 <= deltaY_i <= y_i
```

Native marginal output rate decreases as reserve is consumed, so exact-output
marginal cost is nondecreasing. The solver performs convex water-filling across
candidate positions, handles flat-order ties deterministically, and submits
only a candidate allocation; contracts independently verify every quote,
balance, domain transition, deadline, and aggregate slippage condition.

### Data layer

The Liquid OB Subgraph indexes `Market`, `Position`, `CurveState`, `Fill`, and
`Maker` entities from Aqua lifecycle events plus custom fill and route events.
A reusable query tool exposes at least:

- `discover_positions(market, side, amount)`
- `compare_executable_liquidity(market, amount)`
- `build_candidate_route(market, amount, side)`

The tool composes Liquid OB data with at least one additional standardized DEX
source or Graph product. This makes The Graph load-bearing for discovery while
all balances and final quotes are revalidated onchain.

### Interface

The maker screen draws both sides, their spread, marginal-rate paths, and
cumulative execution. It validates parameters, previews both inventories, and
publishes or replaces the position. The taker screen shows all candidate
positions, solver split, blended price, worst marginal price, pre/post states,
recycled inventory, and one execution action.

The interface must prioritize the visual proof: three exact bounded positions
with visibly different `alpha`, price ranges, and reserves competing for the
same trade. One position must be flat to prove the classic order-book limit.
Raw encoded parameters belong behind an advanced disclosure.

## 6. Correctness gates

No milestone is complete until its tests pass. Required properties are:

1. Exact quote and execution return the same amounts and post-trade state.
2. Exact-input and exact-output are near-inverses within documented rounding.
3. Recovered start, end, and current marginal prices match configuration for
   representative positive, negative, zero, extreme-safe, and flat cases.
4. Splitting a fill along one curve is path-consistent with one combined fill.
5. Every rounding decision is maker-favorable.
6. Every transition preserves `0 <= yAfter <= yInt`, valid bounds, and the
   price monotonicity required by the native orientation.
7. Zero amounts, malformed encodings, invalid `alpha`, transcendental overflow
   domains, stale deadlines, and invalid token directions revert.
8. Batch execution conserves both tokens and is all-or-nothing.
9. Reentrancy and callback behavior cannot bypass accounting or slippage.
10. Official Aqua integration tests show real token transfers, not mocked
    success values.
11. Every active-side input is credited exactly once to the opposite curve; no
    received asset is orphaned or double-counted.
12. Rescaling preserves the opposite curve's marginal price within tolerance,
    including empty-side rearming and flat-order recycling.
13. `yE(xE(y))` recovers reserve state within directional rounding, and every
    finite traversal matches the power-difference rate of its actual pre-fill
    and post-fill marginal prices.
14. Buy compilation is identity while sell compilation reciprocates prices and
    negates displayed `alpha`; both reconstruct the displayed curve.
15. Homothetic rescaling preserves native price and scales the derived
    coordinate by the same factor.

Use Forge unit and fuzz tests, SwapVM `CoreInvariants`, and differential vectors
against an independent high-precision reference model across the supported
`alpha` domain and all exact analytical limits.

## 7. Sponsor strategy

### Primary: 1inch Aqua and SwapVM

This is the architectural center, not an adapter. Liquid OB turns each
two-sided execution policy into a sophisticated Aqua app position, keeps maker
assets self-custodied, and uses SwapVM for programmable settlement. The demo must
include official contracts, real token transfers, tests or UI, and a credible
commit history. A custom SwapVM instruction is the preferred implementation
because the prize states that SwapVM projects score higher.

Before implementation, pin the exact official commits and review Aqua's license
and SwapVM's custom `LicenseRef-Degensoft-SwapVM-1.1` terms. Do not copy or
modify licensed code until the permitted integration path is documented in
`PROVENANCE.md`.

Official reference: https://ethglobal.com/events/lisbon2026/prizes/1inch

### Second: The Graph

Submit one deep data integration that can support multiple Graph tracks:

- A live Subgraph is the discovery source used by the solver and UI.
- A standardized programmable-liquidity schema makes curve orders comparable.
- A reusable MCP/query tool discovers and compares executable liquidity.
- The tool composes at least two meaningful Graph-backed sources or products;
  a single Subgraph query is not presented as innovation.

Prepare a public README/SKILL, live endpoint, and a two-to-four-minute tool
video. Target the Composable and Standardized Data track first; also enter AI
Tooling or Best AI Use only if a real agent reasons over live data and produces
an actionable route rather than wrapping a query.

Official reference: https://ethglobal.com/events/lisbon2026/prizes/the-graph

### Third: Uniswap

The sponsor team provided project-specific written confirmation that Liquid OB
may enter the classic Best Uniswap API Integration bounty without forcing an
API integration into this new market primitive. Therefore no Uniswap adapter,
API key, or artificial routing dependency belongs in the build plan.

The confirmation is preserved privately. The public submission must identify
the project clearly, include a completed `FEEDBACK.md`, and submit the Uniswap
Developer Feedback Form with a link to that file. The submission note should
state concisely that sponsor-specific eligibility was confirmed in writing;
it should not publish private chat screenshots or personal contact details.

The confirmation only waives the forced API integration. It does not waive the
published public-repository and open-source requirements. An explicit
open-source license must therefore be selected before submission.

Official reference: https://ethglobal.com/events/lisbon2026/prizes/uniswap-foundation

Do not target World, Sui, Hedera, 0G, ENS, or unrelated tracks in the MVP. The
three partner selections are now fixed to 1inch, The Graph, and Uniswap; a
fourth integration would fragment implementation time without strengthening
the core proof.

## 8. Time-boxed build order

Use `T0` as the start of protocol implementation and work backward from the
actual Hacker Dashboard deadline. Do not rely on dates copied from older event
pages. Preserve the final three to four hours as an untouched submission buffer.

| Window | Deliverable | Exit test |
| --- | --- | --- |
| T0 to T+1h | Freeze wire format, threat model, dependency commits, and licenses | Written spec and no unresolved license blocker |
| T+1h to T+4h | General `alpha` math, exact limits, and flat-order path | Unit, boundary, differential, fuzz, and rounding tests green |
| T+4h to T+8h | SwapVM instruction and router | Official invariant harness plus one quoted fill green |
| T+8h to T+11h | Aqua lifecycle and settlement | Two-sided publish, recycle, fill, cancel, and real transfer E2E green |
| T+11h to T+14h | Atomic multi-order executor | Three-maker route settles or fully reverts |
| T+14h to T+17h | TypeScript compiler and solver | Differential vectors match Solidity exactly |
| T+17h to T+20h | Maker and taker UI | Primary demo path works without console intervention |
| T+20h to T+22h | The Graph index and query tool | Fresh fill appears and changes the next route |
| T+22h to T+24h | Testnet deploy and seeded market | Two complete rehearsals from funded demo wallets |
| Final buffer, 30m | Uniswap feedback and form evidence | `FEEDBACK.md`, form, and identifying note complete |
| Final 3 to 4h | Submission package | CI, links, video, forms, README, and pitch verified |

Feature freeze begins four hours before submission. After freeze, only blockers,
documentation, rehearsal, and submission work are allowed.

## 9. Stop-loss rules

- If a custom SwapVM instruction is blocked for more than 90 minutes, implement
  the same curve as a direct official Aqua app, preserve onchain transfers, and
  return to SwapVM only after the demo is green.
- If atomic batching is blocked for more than 60 minutes, keep the solver and
  sequential fills as a clearly labelled fallback, but continue treating one
  atomic route as the highest-priority missing feature.
- If hosted Graph deployment is blocked for more than 60 minutes, switch to a
  supported live provider or self-hosted path rather than mocking indexed data.
- Never add an artificial Uniswap API call after receiving an explicit waiver.
- Never sacrifice tests, real transfers, or the final submission buffer for a
  fourth sponsor integration.

## 10. Commit sequence

Each commit must build and test independently. The intended sequence is:

1. `docs: freeze hackathon execution plan`
2. `build: add official Aqua and SwapVM dependencies`
3. `feat: define bounded curve and two-sided position types`
4. `feat: implement closed-form curve quote math`
5. `test: cover curve branches, invariants, and rounding`
6. `feat: implement automatic opposite-curve rescaling`
7. `feat: add Liquid Curve SwapVM instruction and router`
8. `test: integrate Aqua recycling and token transfers`
9. `feat: add atomic multi-position execution`
10. `feat: add TypeScript position compiler and solver`
11. `feat: build maker position workflow`
12. `feat: build taker routing and execution workflow`
13. `feat: index live position liquidity with The Graph`
14. `chore: deploy and seed demo environment`
15. `docs: complete Uniswap feedback and submission evidence`
16. `docs: finalize submission and demo`

## 11. Four-minute demo

| Time | What the audience sees |
| --- | --- |
| 0:00 to 0:20 | One sentence: traditional orders are constants; Liquid OB orders are bounded executable functions. |
| 0:20 to 0:50 | Three two-sided positions, including one flat order, with different `alpha` and ranges. |
| 0:50 to 1:30 | Three makers publish both sides through Aqua and SwapVM. |
| 1:30 to 2:30 | A taker enters size; the solver visibly splits the route and executes one transaction. |
| 2:30 to 3:10 | The received assets appear in the opposite curves; The Graph surfaces the indexed new state. |
| 3:10 to 3:40 | Show the sponsor-specific architecture and one focused test or transaction trace. |
| 3:40 to 4:00 | Close on the shift from one price point to an entire bounded execution policy. |

Pre-fund every wallet, pre-open every tab, keep transaction links ready, and
record a fallback demo using the same deployed contracts. Never wait for a live
indexer or faucet on stage.

## 12. Submission checklist

- Public repository, meaningful history, no secrets, clean fresh-clone setup.
- Explicit open-source license compatible with the selected sponsor tracks.
- Exact deployed addresses, chain IDs, transaction hashes, and contract links.
- One-command tests and CI badge; no production-readiness claim.
- Architecture diagram, curve equation, threat model, and known limitations.
- Sponsor matrix mapping each requirement to files, lines, live evidence, and
  the relevant moment in the video.
- 1inch official-contract evidence and onchain token transfers.
- The Graph live endpoint, reusable tool documentation, and tool video.
- Completed Uniswap `FEEDBACK.md`, feedback form, identifying note, and private
  copy of the written eligibility confirmation.
- Two-to-four-minute submission video plus the rehearsed four-minute live demo.
- AI-use disclosures and material prompt specifications.
- Final mobile/desktop smoke test and a second browser/wallet fallback.

The winning priority order is fixed: correct curve math, official settlement,
atomic multi-maker routing, understandable UI, live discovery, then submission
evidence for the three selected partners.
