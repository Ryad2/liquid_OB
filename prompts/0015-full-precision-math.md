# Prompt 0015: Full-Precision Arithmetic

## Request

Resume the dependency-ordered implementation after the parallel frontend
handoff and complete Phase 4A only.

## Scope

- Implement checked unsigned and signed full-precision multiplication and
  division.
- Define `Rounding.Down` as mathematical floor and `Rounding.Up` as
  mathematical ceiling for every sign combination.
- Add WAD multiplication, division, reciprocal, checked signed conversion,
  uint128 `AmountWad` narrowing, raw-token normalization, reserve arithmetic,
  and proportional scaling.
- Reuse only the already pinned and licensed OpenZeppelin arithmetic primitives;
  do not copy a new math implementation.
- Test deterministic boundaries, a committed oracle interval, high product
  bits, overflow, underflow, token decimals, and fuzz properties.
- Update authoritative status and architecture documents.

## Exclusions

- No logarithm, exponential, power, curve compiler, quote map, position state,
  token settlement, solver, Subgraph, or frontend behavior.

## Exit Gate

All targeted and repository-wide Solidity tests, formatting, lint, TypeScript
checks, reference-model tests, and deterministic-vector checks pass before one
coherent Phase 4A commit is created.
