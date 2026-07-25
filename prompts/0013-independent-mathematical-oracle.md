# Prompt 0013: Independent Mathematical Oracle

Date: 25 July 2026

## Request

Continue implementation with the next dependency-ordered phase after the
canonical protocol language and ETHGlobal rules compliance gate.

## Required Output

- Implement a high-precision evaluator directly from `MATH_SPEC.md`.
- Keep it independent from future Solidity and TypeScript implementations.
- Cover positive, negative, zero, singular-neighbor, and flat alpha cases.
- Cover buy/sell compilation, partial/full fills, exact input/output, effective
  prices, coordinate inverses, recycling, and invalid domains.
- Commit deterministic language-neutral JSON values.
- Store ideal real values together with adjacent WAD floor/ceiling intervals.
- Fail CI when regeneration differs from the committed vectors.
- Do not implement any EVM curve arithmetic during this phase.

## Decision

The development oracle uses only Python's standard-library `Decimal` module at
120-digit precision. Valid vectors cross-check the reduced encoding against
the independently integrated Holder curve, the reserve and conjugate
orientations, endpoint effective means, analytical inverse, path splitting,
and recycling identities. Invalid vectors declare stable domain-error codes.
The complete trust boundary and regeneration workflow are normative in
`docs/REFERENCE_MODEL.md`.
