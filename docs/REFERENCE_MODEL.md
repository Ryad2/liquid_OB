# Independent Mathematical Reference Model

## Purpose

Phase 3 establishes expected mathematical results before the Solidity and
TypeScript kernels exist. The oracle is development-only and evaluates the
real-number equations in [`MATH_SPEC.md`](MATH_SPEC.md) with Python's
arbitrary-precision `Decimal` standard library.

The trust boundary is deliberate:

- it imports no Solidity artifacts, ABI, generated client, or future SDK;
- it uses 120 decimal digits internally and serializes 72 decimal places;
- it evaluates exact native-alpha-zero, native-alpha-one, and flat branches;
- it cross-checks the reduced coordinate against the independently integrated
  Holder schedule;
- it commits generated JSON so normal Solidity tests will require no Python,
  FFI, RPC, or network access.

This model proves equation transcription and mathematical identities. It does
not prove EVM overflow safety, token transfer behavior, settlement security,
or that every real Decimal input is accepted by the future fixed-point kernel.

## Files

- `tools/reference/reference_math.py`: independent real-number evaluator.
- `tools/reference/vector_cases.py`: deterministic scenarios and coverage.
- `tools/reference/generate_vectors.py`: write/check command.
- `tools/reference/test_reference_math.py`: oracle and invalid-domain tests.
- `test/vectors/curve_reference_v1.json`: valid curves and recycling cases.
- `test/vectors/invalid_domains_v1.json`: declared deterministic failures.

## Covered Mathematics

Every valid curve vector records:

- displayed Holder schedule and buy/sell native compilation;
- reciprocal sell orientation and alpha sign change;
- `betaNative = alphaNative - 1`;
- reduced `mu`/`kappa` encoding and reconstructed boundaries;
- native marginal rate, integrated `x(y)`, and analytical `y(x)`;
- conjugate `betaNative` Holder schedule at the derived `x` coordinate;
- direct integral versus reduced-coordinate equality;
- exact-output quote and exact-input round trip;
- secant effective rate versus endpoint dual mean;
- generalized interior `yInt` recovery;
- full-domain intercept ratio and split-path consistency;
- nondecreasing exact-output marginal cost required by the solver;
- ideal real values and normalized WAD rounding intervals.

The scenario matrix includes positive, negative, zero, large, and one-WAD
neighbor alpha values; all five non-flat numerical branches; buy and sell;
partial, full, near-full, and near-empty states; and both flat orientations.
Separate transition vectors prove homothetic rescaling and empty-side rearming.

## Rounding Contract

The JSON stores ideal normalized real values plus the adjacent WAD integers:

```json
{
  "direction": "ceiling",
  "floor": "909762010458269005",
  "ceiling": "909762010458269006"
}
```

Future exact-output required input selects `ceiling`; delivered output selects
`floor`. These are normalized WAD intervals, not raw token-decimal settlement
amounts. Raw-token conversion must apply the same public rounding direction at
the transfer boundary and mutate state using the transferred amount.

## Commands

From the repository root:

```bash
python3 -m unittest tools.reference.test_reference_math -v
python3 -m tools.reference.generate_vectors --check
python3 -m tools.reference.generate_vectors
```

`--check` never writes. It exits unsuccessfully if a committed file is absent
or differs byte-for-byte from deterministic regeneration. The write command is
used only after reviewing an intentional equation or scenario change.

## Change Rule

Never edit generated JSON manually. Change the independent evaluator or a
named scenario, run the oracle tests, regenerate, inspect the numerical diff,
and explain the mathematical reason in the same commit. A later Solidity or
SDK mismatch must not be fixed by changing expected values unless the
normative equation itself is independently shown to be wrong.
