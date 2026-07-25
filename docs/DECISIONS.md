# Architecture Decision Log

Only accepted decisions belong here. Open questions are deliberately not
presented as architecture.

## ADR-001: Require independently justified architecture

- Date: 25 July 2026
- Status: accepted
- Decision: every protocol component must be justified against Liquid OB's
  current product, correctness, and sponsor requirements. Any imported
  dependency or component must pass a license, provenance, and security review
  before use.
- Reason: keep the implementation coherent and auditable instead of inheriting
  architecture that does not serve the functional-order-book design.

## ADR-002: Separate deterministic contracts from offchain discovery

- Date: 25 July 2026
- Status: accepted for workspace boundaries only
- Decision: keep EVM contracts, the web application, reusable TypeScript
  packages, and offchain services in separate top-level workspaces.
- Reason: prevent secrets and nondeterministic API logic from leaking into the
  browser or the settlement layer. No protocol architecture is implied yet.

## ADR-003: Preserve the exact bounded curve kernel

- Date: 25 July 2026
- Status: accepted
- Decision: every directional side compiles to the reduced native state
  `(y, yInt, alphaNative, mu, kappa)`, with
  `betaNative = alphaNative - 1`. Every representable and numerically safe
  `alpha` is accepted. Native `alpha = 0`, native `alpha = 1`, and the
  equal-endpoint flat order are exact internal paths, not maker-facing curve
  modes. Piecewise-linear approximations are not part of the protocol.
- Reason: the bonding-curve family is the project's core financial primitive.
  Liquid OB's product advantage comes from publishing and aggregating these
  expressive execution policies rather than reducing orders to price points.

## ADR-004: Use two-sided self-recycling maker positions

- Date: 25 July 2026
- Status: accepted
- Decision: one maker position contains an independently configured sell curve
  and buy curve. Every active-side input is credited to the opposite side. A
  nonempty opposite curve is rescaled proportionally in reserve and domain so
  its normalized progress and current marginal price do not move and its
  derived coordinate scales homothetically; an empty side rearms at its
  committed starting price.
- Reason: received inventory becomes immediately executable without forcing bid
  and ask curves to meet, while preserving explicit maker control over spread
  and shape.

## ADR-005: Keep global search offchain and validation onchain

- Date: 25 July 2026
- Status: accepted
- Decision: The Liquid OB Subgraph materializes every maker position as an
  independent programmable micro-pool and supplies the complete indexed market
  snapshot to an untrusted solver. The solver optimizes locally, then refreshes
  only its selected fills and a bounded reserve shortlist through batched RPC
  reads. Contracts revalidate selected versions, balances, quotes, state
  transitions, deadline, and aggregate slippage before atomic settlement.
- Reason: iterating over an unbounded global order set inside one EVM
  transaction is not gas-bounded, while one RPC read per maker is too slow at
  scale. Indexed global search plus bounded onchain refresh provides realistic
  routing without weakening settlement correctness.

## ADR-006: Separate displayed price from native exchange rate

- Date: 25 July 2026
- Status: accepted
- Decision: the interface always exposes quote per base, while the kernel always
  evaluates outgoing token per incoming token. Buy curves compile directly.
  Sell curves compile by reciprocal endpoint conversion and displayed
  `alpha -> -alpha`. All quotes, events, SDK methods, and tests must label which
  convention they use.
- Reason: silently mixing input-per-output and output-per-input reverses quote
  equations and breaks directional curve equivalence. One explicit boundary
  conversion lets both sides share the same native swap kernel.

## ADR-007: Separate marginal schedule, bonding curve, and effective price

- Date: 25 July 2026
- Status: accepted
- Decision: `P_alpha(t)` denotes only a marginal-price schedule. The actual
  bonding curve is the integrated token-coordinate graph `xE(y)` with inverse
  `yE(x)`. A finite fill's effective price is its secant rate and is computed
  from the fill's actual pre-state and post-state marginal prices, not from the
  configured full-range boundaries unless the entire fresh side is consumed.
- Reason: treating a derivative schedule as an invariant or substituting full
  bounds into a partial-fill quote produces economically incorrect execution
  prices even when the underlying closed forms are correct.

## ADR-008: Make the SwapVM router the Aqua app

- Date: 25 July 2026
- Status: accepted
- Decision: each position is an immutable Aqua strategy whose bytes are a
  custom SwapVM program. The custom Liquid OB router is the Aqua app, extends
  the pinned official SwapVM/Aqua path with one curve instruction, and leaves
  final maker/taker token settlement to SwapVM and Aqua. There is no factory,
  per-position contract, protocol vault, or parallel settlement path.
- Reason: Aqua strategy publication already supplies immutable intent,
  allocation, cancellation, and lifecycle events. Making the curve native to
  SwapVM keeps the sponsor integration load-bearing while minimizing custody
  and contract surface.

## ADR-009: Separate Aqua allocation from logical curve accounting

- Date: 25 July 2026
- Status: accepted
- Decision: Aqua is authoritative for virtual allocation and transfer
  lifecycle, while router storage is authoritative for each side's logical
  executable reserve, domain scale, and state version. Only a successful
  Liquid OB fill mutates logical state. Unsolicited Aqua credits are ignored as
  curve inventory, and maker top-ups or parameter changes use dock-and-republish.
- Reason: shared virtual allocation and public credits must not silently alter
  a maker's committed execution policy or allow a third party to move its
  marginal state.

## ADR-010: Derive discovery from canonical lifecycle events

- Date: 25 July 2026
- Status: accepted
- Decision: The Graph decodes immutable strategy bytes from Aqua `Shipped`
  events and combines Aqua lifecycle events with custom fill and route events.
  No separate onchain position directory is introduced. The Subgraph remains
  discovery state only, and the solver refreshes every selected position from
  the router and Aqua before simulation.
- Reason: Aqua already emits the full immutable strategy and lifecycle. A
  second publication registry would duplicate state without improving
  settlement correctness.
