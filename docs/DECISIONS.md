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
- Reason: the bounding-curve family is the project's core financial primitive.
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
- Decision: The Graph discovers all eligible live positions and an untrusted
  solver computes a candidate split offchain. Contracts revalidate selected
  nonces, balances, quotes, state transitions, deadline, and aggregate slippage
  before atomic settlement.
- Reason: iterating over an unbounded global order set inside one EVM
  transaction is not gas-bounded. Offchain optimization provides global search
  without weakening settlement correctness.

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
