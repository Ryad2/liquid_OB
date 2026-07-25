# Liquid OB Hackathon Execution Plan

## 1. Mission

Build the smallest complete proof that a functional order book is useful:

> Liquid OB is an order book where each maker order is an exact bounded
> execution curve. A solver routes one taker order across competing curves,
> and the resulting fills settle from self-custodied 1inch Aqua balances.

The project wins by making this claim visible in one transaction, not by
shipping the largest protocol. The live demo must show three curves with
different bounds and shape parameters, a better split than any single curve,
actual token transfers, and indexed post-trade state.

## 2. Definition of success

The core is demo-ready only when all of the following are true:

1. A maker can define, validate, fund, publish, replace, and cancel a curve
   order from `pLow`, `pHigh`, `pMgnl`, reserve, and `alpha`.
2. A taker can request exact-input and exact-output quotes from a single curve.
3. A solver can compare live curves and split one order across at least three
   maker positions.
4. One atomic transaction enforces aggregate slippage and settles every fill
   through official Aqua or SwapVM contracts.
5. The UI shows the curve, selected fills, blended execution price, expected
   balance changes, transaction hash, and indexed fill history.
6. Unit, fuzz, invariant, and end-to-end tests are green from a fresh clone.
7. A four-minute demo can be completed twice without manual repair.

This remains hackathon software. Audit, formal verification, economic stress
testing, and production operations are explicitly outside the submission claim.

## 3. Frozen MVP

### In scope

- Independent one-direction maker orders. A two-sided maker publishes one bid
  curve and one ask curve; the protocol does not force them to meet or share a
  shape parameter.
- The exact Liquid OB curve family with all five canonical `alpha` branches:
  `alpha > 1`, `alpha = 1`, `0 < alpha < 1`, `alpha = 0`, and `alpha < 0`.
- The compact runtime state `(y, yInt, aHat, bHat, alpha)` and closed-form
  exact-input and exact-output quote functions.
- Exact price bounds and marginal-price reconstruction with maker-favorable
  rounding at token-transfer boundaries.
- Aqua-backed maker inventory and a custom SwapVM instruction/router if the
  official contracts and license permit the intended extension.
- Offchain discovery and route optimization followed by exact onchain
  validation and atomic execution.
- A live The Graph index for discovery, fills, and analytics.
- A focused maker and taker interface.

### Explicitly out of scope

- LP shares, fungible pools, pair factories, and forced bonding-curve symmetry.
- Active/spectator pair coupling in the first order-book demo. It is a
  composition layer between two curves, not a replacement for the single-curve
  kernel, and can be added without changing order math.
- Piecewise-linear approximations of the core curve.
- Arbitrary maker-provided bytecode or unrestricted mathematical expressions.
- Oracles as a settlement dependency. Makers quote prices; arbitrage and the
  solver align competing liquidity with external markets.
- Governance, protocol fees, bridges, multichain deployment, margin, leverage,
  liquidations, and production admin systems.
- Superficial integrations added only to increase the number of prize logos.

## 4. Order semantics and math

Each order uses a canonical reserve/input frame. The maker supplies reserve
token `y` and receives input token `x`. The curve stores only:

```text
(y, yInt, aHat, bHat, alpha)
```

`x`, `pLow`, `pHigh`, and `pMgnl` are derived views, not persistent state. Let:

```text
r = y / yInt
s = bHat / aHat
```

The exact marginal-price function is:

```text
           s * exp(aHat * r)                              if alpha = 0
p(y) =     bHat * (1 / aHat + r - 1)                     if alpha = 1
           s * (1 - aHat * r)^(1 / alpha)                if alpha < 0
           s * (1 - aHat * (1 - r))^(1 / alpha)          if alpha > 0, alpha != 1
```

The maker-facing configuration is `(y, pLow, pHigh, pMgnl, alpha)`, normalized
to WAD units. The codec derives:

```text
aHat = ln(pHigh / pLow)                                  if alpha = 0
aHat = 1 - (pLow / pHigh)^abs(alpha)                     otherwise

bHat = aHat * pHigh                                      if alpha > 0
bHat = aHat * pLow                                       if alpha <= 0
```

For an interior initial state, `yInt` is recovered from the chosen marginal
price:

```text
yInt = y * ln(pHigh / pLow) / ln(pMgnl / pLow)           if alpha = 0

yInt = y * (pHigh^alpha - pLow^alpha)
           / (pMgnl^alpha - pLow^alpha)                  otherwise
```

The implementation dispatches the five `alpha` branches exactly because
`alpha = 0` and `alpha = 1` are singular closed forms, not neighborhoods to be
approximated. It uses fixed-point `pow`, `exp`, and `ln` primitives with explicit
domain checks and no segment approximation or iterative swap-time root solver.

`pMgnl` selects the initial point on one curve. It is not a global market price
and does not force a maker's bid and ask curves to meet. Reverse-facing prices,
bounds, coordinates, and `alpha` are normalized with a canonical reciprocal
transform before curves are compared.

The immutable Aqua program commits `yInt`, `aHat`, `bHat`, `alpha`, token
orientation, and maker. The live Aqua reserve balance supplies `y`; execution
requires `0 <= y <= yInt`. A fill moves `y` through the exact quote function.
Maker reconfiguration uses cancel-and-republish, while taker deadlines and
aggregate slippage protect against state changes between discovery and
execution.

## 5. Architecture

### Settlement layer

- `CurveCodec`: compiles and validates the external and compact curve state,
  then reconstructs bounds and marginal prices.
- `CurveMath`: implements the five closed-form exact-input and exact-output
  branches over `(y, yInt, aHat, bHat, alpha)`.
- `FixedPoint` and `FixedPointTranscendentals`: provide full-precision WAD
  arithmetic, powers, logarithms, and exponentials with checked domains.
- `LiquidCurveInstruction`: custom SwapVM instruction that decodes the compact
  curve state, reads the relevant Aqua balance, computes a fill, and applies
  the required maker/taker balance deltas.
- `LiquidCurveRouter`: validates tokens, amounts, deadline, and minimum output
  or maximum input before invoking SwapVM in Aqua mode.
- `BatchExecutor`: executes multiple selected maker orders atomically and
  enforces aggregate conservation and slippage.
- `CurveDirectory`: emits typed publication, replacement, cancellation, and
  fill metadata for discovery. It is not the source of settlement truth.

Official Aqua balances remain the source of maker inventory. Liquid OB must not
introduce a parallel custody vault. Curve programs are immutable; updates use a
cancel-and-republish lifecycle.

### SDK and solver

- Compile `(reserve, pLow, pHigh, pMgnl, alpha)`, direction, and token decimals
  into a canonical compact curve program and strategy hash.
- Reproduce contract quotes exactly in TypeScript, including rounding.
- Discover candidate orders, validate their current onchain state, and optimize
  allocations using each curve's exact branch-specific quote function.
- Re-quote the final route onchain immediately before building calldata.
- Return a transparent route: maker, input, output, `alpha` branch, `pBefore`,
  `pAfter`, and effective price for every fill.

For exact output `Y`, the solver minimizes the sum of the exact curve input
functions subject to reserve domains:

```text
minimize    sum(deltaX_i(deltaY_i))
subject to  sum(deltaY_i) = Y
            0 <= deltaY_i <= y_i
```

The solver must not assume that a naive greedy algorithm is globally optimal
for every `alpha` branch. It uses branch-aware optimization offchain and submits
only a candidate allocation; contracts independently verify every quote,
balance, domain transition, deadline, and aggregate slippage condition.

### Data layer

The Liquid OB Subgraph indexes `Market`, `CurveOrder`, `CurveState`, `Fill`, and
`Maker` entities from directory and settlement events. A reusable query tool
exposes at least:

- `discover_curves(market, side, amount)`
- `compare_executable_liquidity(market, amount)`
- `build_candidate_route(market, amount, side)`

The tool composes Liquid OB data with at least one additional standardized DEX
source or Graph product. This makes The Graph load-bearing for discovery while
all balances and final quotes are revalidated onchain.

### Interface

The maker screen draws the marginal-rate curve and cumulative cost, validates
all parameters, previews inventory requirements, and publishes or replaces the
position. The taker screen shows all candidate curves, the solver split, blended
price, worst marginal price, pre/post curve states, and one execution action.

The interface must prioritize the visual proof: three exact bounded curves with
visibly different `alpha`, price bounds, and available reserves competing for
the same trade. Raw encoded parameters belong behind an advanced disclosure,
not in the primary demo path.

## 6. Correctness gates

No milestone is complete until its tests pass. Required properties are:

1. Exact quote and execution return the same amounts and post-trade state.
2. Exact-input and exact-output are near-inverses within documented rounding.
3. Recovered `pLow`, `pHigh`, and `pMgnl` match configuration across all five
   exact `alpha` branches within documented fixed-point tolerances.
4. Splitting a fill along one curve is path-consistent with one combined fill.
5. Every rounding decision is maker-favorable.
6. Every transition preserves `0 <= yAfter <= yInt`, valid bounds, and the
   branch-specific price monotonicity required by the native orientation.
7. Zero amounts, malformed encodings, invalid `alpha`, transcendental overflow
   domains, stale deadlines, and invalid token directions revert.
8. Batch execution conserves both tokens and is all-or-nothing.
9. Reentrancy and callback behavior cannot bypass accounting or slippage.
10. Official Aqua integration tests show real token transfers, not mocked
    success values.

Use Forge unit and fuzz tests, SwapVM `CoreInvariants`, and differential vectors
against an independent high-precision reference model for every `alpha` branch.

## 7. Sponsor strategy

### Primary: 1inch Aqua and SwapVM

This is the architectural center, not an adapter. Liquid OB turns each exact
bounded curve into a sophisticated Aqua position, keeps maker assets
self-custodied, and uses SwapVM for programmable settlement. The demo must
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
| T+1h to T+4h | Curve codec and five closed-form math branches | Unit, boundary, differential, fuzz, and rounding tests green |
| T+4h to T+8h | SwapVM instruction and router | Official invariant harness plus one quoted fill green |
| T+8h to T+11h | Aqua lifecycle and settlement | Publish, fund, fill, cancel, and real transfer E2E green |
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
3. `feat: define bounded curve types and codec`
4. `feat: implement closed-form curve quote math`
5. `test: cover curve branches, invariants, and rounding`
6. `feat: add Liquid Curve SwapVM instruction and router`
7. `test: integrate Aqua settlement and token transfers`
8. `feat: add atomic multi-order execution`
9. `feat: add TypeScript curve compiler and solver`
10. `feat: build maker curve workflow`
11. `feat: build taker routing and execution workflow`
12. `feat: index live curve liquidity with The Graph`
13. `chore: deploy and seed demo environment`
14. `docs: complete Uniswap feedback and submission evidence`
15. `docs: finalize submission and demo`

## 11. Four-minute demo

| Time | What the audience sees |
| --- | --- |
| 0:00 to 0:20 | One sentence: traditional orders are constants; Liquid OB orders are bounded executable functions. |
| 0:20 to 0:50 | Three bounded orders with different `alpha` and price ranges for the same market. |
| 0:50 to 1:30 | Three makers publish funded positions through Aqua and SwapVM. |
| 1:30 to 2:30 | A taker enters size; the solver visibly splits the route and executes one transaction. |
| 2:30 to 3:10 | Wallet/Aqua balances change and The Graph surfaces the indexed fills and new liquidity state. |
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
