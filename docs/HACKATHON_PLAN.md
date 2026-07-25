# Liquid OB Hackathon Execution Plan

## 1. Mission

Build the smallest complete proof that a functional order book is useful:

> Liquid OB is an order book where each maker order is a bounded executable
> curve. A solver routes one taker order across competing curves, and the
> resulting fills settle from self-custodied 1inch Aqua balances.

The project wins by making this claim visible in one transaction, not by
shipping the largest protocol. The live demo must show three independently
configured maker curves, a better split than any single curve, actual token
transfers, and indexed post-trade state.

## 2. Definition of success

The core is demo-ready only when all of the following are true:

1. A maker can define, validate, fund, publish, replace, and cancel a bounded
   curve order.
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
- A safe curve language made of at most four piecewise-linear marginal-rate
  segments.
- Flat segments as the exact limit-order special case.
- Exact-input and exact-output quoting with maker-favorable rounding.
- Aqua-backed maker inventory and a custom SwapVM instruction/router if the
  official contracts and license permit the intended extension.
- Offchain discovery and route optimization followed by exact onchain
  validation and atomic execution.
- A live The Graph index for discovery, fills, and analytics.
- A focused maker and taker interface.

### Explicitly out of scope

- LP shares, fungible pools, pair factories, coupled buy/sell reserves, and
  forced bonding-curve symmetry.
- Arbitrary maker-provided bytecode or unrestricted mathematical expressions.
- Oracles as a settlement dependency. Makers quote prices; arbitrage and the
  solver align competing liquidity with external markets.
- Governance, protocol fees, bridges, multichain deployment, margin, leverage,
  liquidations, and production admin systems.
- Superficial integrations added only to increase the number of prize logos.

## 4. Order semantics and math

For every order, the maker sells `tokenOut` and receives `tokenIn`. Let `q` be
the cumulative raw `tokenOut` already consumed. Define `r(q)` as raw
`tokenIn` required for one raw unit of `tokenOut`, scaled by `1e18`.

Each segment commits:

- `capacityOut`: maximum raw output available in that segment.
- `rateStartWad`: marginal input-per-output rate at the segment start.
- `rateEndWad`: marginal input-per-output rate at the segment end.

For local consumption `x` in a segment of capacity `C`:

```text
r(x) = r0 + (r1 - r0) * x / C

cost(x) = r0 * x + (r1 - r0) * x^2 / (2 * C)
```

All divisions include the `1e18` rate scale and use full-precision arithmetic.
The compiler converts human token decimals into raw rates offchain so the
execution path never calls token metadata.

The order is valid only if capacities are nonzero, rates are nonzero, segment
boundaries are continuous, and marginal rates never decrease. Therefore later
liquidity cannot become cheaper for the taker. An ask displays `r(q)` directly;
a bid displays its inverse in the UI while preserving one mechanical contract
orientation.

Exact-output integrates the traversed segments. Exact-input solves the same
quadratic per segment with a fixed-point square root, then verifies the result
against the forward cost. Rounding must always protect the maker: input owed is
rounded up and output delivered is rounded down.

The immutable curve program commits the original output capacity. Current
consumption is derived from that capacity and the corresponding Aqua virtual
balance, avoiding a second mutable fill counter. Execution rejects balances
outside the committed domain. Maker inventory changes are treated like order
replacement and are protected for takers by deadline and aggregate slippage.

## 5. Architecture

### Settlement layer

- `LiquidCurveMath`: pure validation, integration, inversion, and segment
  traversal.
- `LiquidCurveInstruction`: custom SwapVM instruction that decodes the bounded
  program, reads the relevant Aqua balance, computes a fill, and applies the
  required maker/taker balance deltas.
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

- Compile user-facing prices, capacities, direction, and token decimals into a
  canonical program hash and raw segment encoding.
- Reproduce contract quotes exactly in TypeScript, including rounding.
- Discover candidate orders, validate their current onchain state, rank current
  marginal rates, and allocate volume until the requested amount is filled.
- Re-quote the final route onchain immediately before building calldata.
- Return a transparent route: maker, amount, segment, marginal range, and cost
  for every fill.

The first solver is deterministic greedy routing over monotone marginal curves.
It is sufficient because the next cheapest marginal unit is optimal under the
frozen MVP assumptions. More general optimization is future work.

### Data layer

The Liquid OB Subgraph indexes `Market`, `CurveOrder`, `Segment`, `Fill`, and
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

The interface must prioritize the visual proof: a flat order and two shaped
orders competing for the same trade. Raw protocol configuration belongs behind
an advanced disclosure, not in the primary demo path.

## 6. Correctness gates

No milestone is complete until its tests pass. Required properties are:

1. Exact quote and execution return the same amounts and post-trade state.
2. Exact-input and exact-output are near-inverses within documented rounding.
3. Marginal price is monotone and remains inside every segment's bounds.
4. Splitting a fill along one curve is path-consistent with one combined fill.
5. Every rounding decision is maker-favorable.
6. Fills cannot exceed live Aqua balance or committed curve capacity.
7. Zero amounts, malformed encodings, discontinuities, overflow domains, stale
   deadlines, and invalid token directions revert.
8. Batch execution conserves both tokens and is all-or-nothing.
9. Reentrancy and callback behavior cannot bypass accounting or slippage.
10. Official Aqua integration tests show real token transfers, not mocked
    success values.

Use Forge unit and fuzz tests, SwapVM `CoreInvariants`, and one small independent
reference model for differential vectors if the core demo is already green.

## 7. Sponsor strategy

### Primary: 1inch Aqua and SwapVM

This is the architectural center, not an adapter. Liquid OB turns each curve
into a sophisticated Aqua position, keeps maker assets self-custodied, and uses
SwapVM for programmable settlement. The demo must include official contracts,
real token transfers, tests or UI, and a credible commit history. A custom
SwapVM instruction is the preferred implementation because the prize states
that SwapVM projects score higher.

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

### Conditional third: Uniswap

Do not build this before the core demo is green and an explicit answer about
API eligibility is received. A friendly invitation is valuable but is not a
substitute for written qualification.

If a valid API integration is required, add a server-side adapter for the maker
`Fund, Rebalance, and Publish` flow: use the Uniswap API and a valid key to
acquire the desired inventory, execute the returned transaction onchain, then
publish the funded Aqua position. Keep the key off the client and make the API
step genuine core functionality for this workflow. Add `FEEDBACK.md`, submit
the feedback form, identify the project as requested, and point the README to
the exact integration.

If a written exception is granted, follow its exact terms and preserve the
message privately. If neither path is certain, do not spend demo reliability
to chase this prize.

Official reference: https://ethglobal.com/events/lisbon2026/prizes/uniswap-foundation

### Backup third: World AgentKit

Use this only if Uniswap is unavailable and the core is already complete. A
human-backed agent receives a short-lived, nonce-bound authorization for a
specific market, side, maximum volume, and deadline. The executor verifies the
authorization before allowing the agent to trade. This changes execution rights
rather than offering a cosmetic login, reputation score, or discount.

Official reference: https://ethglobal.com/events/lisbon2026/prizes/world

Do not target Sui, Hedera, 0G, ENS, or unrelated tracks in the MVP. They would
fragment implementation time without strengthening the core proof.

## 8. Time-boxed build order

Use `T0` as the start of protocol implementation and work backward from the
actual Hacker Dashboard deadline. Do not rely on dates copied from older event
pages. Preserve the final three to four hours as an untouched submission buffer.

| Window | Deliverable | Exit test |
| --- | --- | --- |
| T0 to T+1h | Freeze wire format, threat model, dependency commits, and licenses | Written spec and no unresolved license blocker |
| T+1h to T+4h | Pure piecewise-linear math | Unit, boundary, fuzz, and rounding tests green |
| T+4h to T+8h | SwapVM instruction and router | Official invariant harness plus one quoted fill green |
| T+8h to T+11h | Aqua lifecycle and settlement | Publish, fund, fill, cancel, and real transfer E2E green |
| T+11h to T+14h | Atomic multi-order executor | Three-maker route settles or fully reverts |
| T+14h to T+17h | TypeScript compiler and solver | Differential vectors match Solidity exactly |
| T+17h to T+20h | Maker and taker UI | Primary demo path works without console intervention |
| T+20h to T+22h | The Graph index and query tool | Fresh fill appears and changes the next route |
| T+22h to T+24h | Testnet deploy and seeded market | Two complete rehearsals from funded demo wallets |
| Conditional, max 2h | Uniswap adapter or World fallback | Sponsor-specific flow works end to end |
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
- Never begin the conditional Uniswap or World work while the core demo is red.
- Never sacrifice tests, real transfers, or the final submission buffer for a
  fourth sponsor integration.

## 10. Commit sequence

Each commit must build and test independently. The intended sequence is:

1. `docs: freeze hackathon execution plan`
2. `build: add official Aqua and SwapVM dependencies`
3. `feat: define bounded curve types and validation`
4. `feat: implement piecewise linear curve math`
5. `test: fuzz curve invariants and rounding`
6. `feat: add Liquid Curve SwapVM instruction and router`
7. `test: integrate Aqua settlement and token transfers`
8. `feat: add atomic multi-order execution`
9. `feat: add TypeScript curve compiler and solver`
10. `feat: build maker curve workflow`
11. `feat: build taker routing and execution workflow`
12. `feat: index live curve liquidity with The Graph`
13. `chore: deploy and seed demo environment`
14. Conditional sponsor integration in its own commit
15. `docs: finalize submission and demo`

## 11. Four-minute demo

| Time | What the audience sees |
| --- | --- |
| 0:00 to 0:20 | One sentence: traditional orders are constants; Liquid OB orders are bounded executable functions. |
| 0:20 to 0:50 | A flat limit order beside two shaped maker curves for the same market. |
| 0:50 to 1:30 | Three makers publish funded positions through Aqua and SwapVM. |
| 1:30 to 2:30 | A taker enters size; the solver visibly splits the route and executes one transaction. |
| 2:30 to 3:10 | Wallet/Aqua balances change and The Graph surfaces the indexed fills and new liquidity state. |
| 3:10 to 3:40 | Show the sponsor-specific architecture and one focused test or transaction trace. |
| 3:40 to 4:00 | Close on the generalization: a classic order is the zero-slope special case. |

Pre-fund every wallet, pre-open every tab, keep transaction links ready, and
record a fallback demo using the same deployed contracts. Never wait for a live
indexer or faucet on stage.

## 12. Submission checklist

- Public repository, meaningful history, no secrets, clean fresh-clone setup.
- Exact deployed addresses, chain IDs, transaction hashes, and contract links.
- One-command tests and CI badge; no production-readiness claim.
- Architecture diagram, curve equation, threat model, and known limitations.
- Sponsor matrix mapping each requirement to files, lines, live evidence, and
  the relevant moment in the video.
- 1inch official-contract evidence and onchain token transfers.
- The Graph live endpoint, reusable tool documentation, and tool video.
- Conditional Uniswap API key flow, `FEEDBACK.md`, form, and identifying note,
  or the exact written exception; otherwise omit the prize claim.
- Two-to-four-minute submission video plus the rehearsed four-minute live demo.
- AI-use disclosures and material prompt specifications.
- Final mobile/desktop smoke test and a second browser/wallet fallback.

The winning priority order is fixed: correct curve math, official settlement,
atomic multi-maker routing, understandable UI, live discovery, then conditional
sponsor expansion.
