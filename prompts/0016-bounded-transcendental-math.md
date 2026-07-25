# Prompt 0016: Bounded Transcendental Math

## Request

Resume the dependency-ordered implementation after Phase 4A and complete Phase
4B only.

## Scope

- Audit fixed-point logarithm, exponential, `log1p`, `expm1`, and real-power
  candidates with exact source revisions and licenses.
- Pin one unmodified approximation backend rather than copying math source.
- Publish explicit logarithm, exponential, power-base, output, and intermediate
  domains owned by Liquid OB.
- Preserve exact zero and power identity cases.
- Avoid near-zero cancellation in `log1p` and `expm1`.
- Compose signed real powers with full-precision arithmetic and propagate
  approximation uncertainty through lower/upper intervals.
- Test independent Decimal values, monotonicity, condition-aware inversions,
  singular neighbors, extreme exponents, and rejected domains.
- Update provenance, numerical specification, audit boundaries, decisions, and
  authoritative implementation status.

## Exclusions

- No curve compilation, endpoint orientation, `mu`/`kappa` commitments,
  coordinate functions, swap maps, position transitions, token settlement,
  solver, Subgraph, or frontend behavior.

## Exit Gate

All targeted and repository-wide Solidity tests, formatting, lint, TypeScript
checks, reference-model tests, and deterministic-vector checks pass before one
coherent Phase 4B commit is created.
