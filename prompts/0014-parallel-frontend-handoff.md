# Prompt 0014: Parallel Frontend Handoff

Date: 25 July 2026

## Request

Due to the hackathon time constraint, unblock UI/UX development before every
contract and backend phase is complete. Document what exists, what remains and
how the complete product must work. Provide a mock frontend entry point whose
integration boundary can later be replaced by real contracts and services
without rebuilding screens. Commit and push the complete handoff.

## Required Output

- Honest implementation status and remaining dependency roadmap.
- Complete maker, taker, manager and explorer frontend contracts.
- Explicit token amount, displayed price, side, rounding and freshness rules.
- One framework-neutral client interface.
- Deterministic mock data for every major screen and transaction flow.
- Exact-input/output multi-maker route fixtures and recycling fields.
- Mock transaction plans that cannot be sent to wallets.
- A single web composition root proving component isolation.
- Tests, documentation, CI-compatible workspace integration and live-switch
  acceptance criteria.

## Decision

`@liquid-ob/frontend-api` is the product boundary. The current web application
uses `MockLiquidOBClient`; the future live client will compose deployment
manifests, exact curve math, The Graph, solver simulation, Lens/RPC and
generated transaction clients behind the same interface. Live mode fails
closed and never auto-falls back to mock.
