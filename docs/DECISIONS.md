# Architecture Decision Log

Only accepted decisions belong here. Open questions are deliberately not
presented as architecture.

## ADR-001: Start from an empty clean-room repository

- Date: 25 July 2026
- Status: accepted
- Decision: no code, tests, UI assets, or project-specific architecture will
  be copied from the previous LiquidSwap repository.
- Reason: preserve a verifiable Classic-track build history and force every
  new implementation choice to be justified independently.

## ADR-002: Separate deterministic contracts from offchain discovery

- Date: 25 July 2026
- Status: accepted for workspace boundaries only
- Decision: keep EVM contracts, the web application, reusable TypeScript
  packages, and offchain services in separate top-level workspaces.
- Reason: prevent secrets and nondeterministic API logic from leaking into the
  browser or the settlement layer. No protocol architecture is implied yet.
