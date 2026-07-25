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
- Decision: every maker order uses the compact curve state
  `(y, yInt, aHat, bHat, alpha)` and its five exact closed-form `alpha`
  branches. Piecewise-linear approximations are not part of the protocol.
- Reason: the bounding-curve family is the project's core financial primitive.
  Liquid OB's product advantage comes from publishing and aggregating these
  expressive execution policies rather than reducing orders to price points.
