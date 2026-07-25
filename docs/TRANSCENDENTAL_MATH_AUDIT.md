# Bounded Transcendental Math Audit

Status: Phase 4B implemented and independently tested on 25 July 2026.

This document records the exact imported implementation, the additional Liquid
OB safety contract, and the claims that remain subject to specialist review.

## Selected Backend

Liquid OB pins Solady tag `v0.1.26`, commit
`acd959aa4bd04720d640bf4e6a5c71037510cc4b`, as an unmodified Git submodule.
The selected source is `src/utils/FixedPointMathLib.sol` under the MIT license;
the full upstream license remains in the submodule.

Liquid OB imports only:

- `FixedPointMathLib.lnWad`, a monotonically increasing `(8, 8)` rational
  approximation after binary range reduction; and
- `FixedPointMathLib.expWad`, a monotonically increasing `(6, 7)` rational
  approximation after binary range reduction.

Liquid OB deliberately does not call Solady `powWad`. That function evaluates
`ln(x) * y` directly in 256 bits and exposes Solady's much wider exponential
domain. `TranscendentalMath.sol` instead combines the two selected primitives
with checked full-product multiplication, protocol-owned domains, exact
identities, and uncertainty propagation.

Official source: https://github.com/Vectorized/solady/tree/v0.1.26

Official license: https://github.com/Vectorized/solady/blob/v0.1.26/LICENSE.txt

## Alternatives Reviewed

| Candidate | Exact reviewed revision | Decision |
| --- | --- | --- |
| SwapVM `Power.sol` | pinned SwapVM commit `ac06e1bac021cd1983dc7c44d1f69b4b8861a945` | Rejected: integer exponents only and no suitable signed-real-power contract. |
| PRBMath v4 | branch commit `4daeacdeacdf90997117e39b8970c1346eed9e8b`, MIT | Rejected for this phase: broader typed dependency with no required capability beyond the narrower pinned Solady backend. |
| OpenZeppelin v5.4.0 | pinned commit `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0`, MIT | Retained for full-product arithmetic, but it does not provide the required fixed-point `ln` and `exp`. |

No candidate source was copied or modified.

## Liquid OB Numerical Contract

All values below are signed or unsigned 18-decimal fixed-point integers.

| Primitive | Accepted input | Output contract |
| --- | --- | --- |
| `lnWad(x)` | `1 <= x <= uint128.max` | signed WAD estimate |
| `expWad(x)` | `-40e18 <= x <= 47e18` | positive WAD value fitting `uint128` |
| `log1pWad(x)` | `-1e18 < x <= uint128.max - 1e18` | signed WAD estimate |
| `expm1Wad(x)` | exponential input domain | signed WAD estimate |
| `powWad(base, exponent)` | positive canonical `uint128` base; uncertainty-expanded `exponent * ln(base)` inside the exponential domain | positive WAD value fitting `uint128` |

The generic exponential ceiling leaves substantial representational headroom:
`exp(47) * 1e18` is approximately
`2.581312886190067396e38`, below `uint128.max` at approximately
`3.402823669209384635e38`. The lower endpoint remains nonzero at WAD
resolution. Inputs beyond either endpoint revert before Solady executes.

Exact identities bypass approximation:

```text
ln(1) = 0
exp(0) = 1
expm1(0) = 0
log1p(0) = 0
x^0 = 1
1^a = 1
x^1 = x
```

`expm1(x)` and `log1p(x)` return `x` directly for `abs(x) <= 1e-9`. The
discarded next Taylor term is at most one WAD wei, avoiding catastrophic
subtraction of two values close to `1e18`.

## Approximation Intervals

The estimate functions are deterministic approximations, not mathematical
floor or ceiling functions. Companion interval functions expose the safety
margin future directional curve arithmetic must consume:

```text
ln lower/upper = estimate +/- 2 WAD wei

exp error = ceil(estimate / 1e18) + 2 WAD wei
exp lower/upper = estimate +/- exp error

near-zero log1p/expm1 error = 1 WAD wei
```

Power intervals first widen `ln(base)`, multiply both endpoints with signed
mathematical floor/ceiling, reject any widened exponential argument outside the
published domain, then widen both exponential endpoints. This prevents a
large exponent from hiding logarithm uncertainty when the base is close to
one.

These margins are deliberately wider than the errors observed in upstream
examples and the independent Decimal vectors. They are an engineering safety
contract for this pinned revision, not a formal proof of the rational
approximation coefficients. A production audit must independently validate or
replace the envelopes before assets of value are enabled.

## Conditioning

An inverse composition cannot have one absolute error bound over the complete
domain. Near the lower exponential boundary, one integer unit of exponential
output is amplified by the logarithm derivative:

```text
ln(exp(x)) error contribution
    <= expOutputError * 1e18 / expOutput
```

Tests use this input-dependent bound. Claiming a constant four-wei round-trip
error at `x = -20e18`, for example, would be false even with an ideal
transcendental algorithm because the exponential result has only about two
billion WAD integer units.

## Evidence

`TranscendentalMath.t.sol` covers:

- exact backend regressions and independent 120-digit Decimal floor/ceiling
  intervals;
- minimum and maximum exponential inputs;
- positive, negative, fractional, and near-one real powers;
- one-wei `log1p` and `expm1` neighbors;
- exact identity bypasses;
- logarithm and exponential monotonicity fuzzing;
- condition-aware inverse composition fuzzing; and
- zero, singular, noncanonical, result-overflow, and extreme-exponent rejects.

Normal tests use no FFI, Python, RPC, or network access.

## Remaining Boundary

Phase 4B does not prove the curve compiler or swap equations. `CurveCompiler`
must select exact flat, native-alpha-zero, and native-alpha-one branches before
using generic powers, preserve the interval direction required by maker-safe
rounding, and reject configurations whose widened commitments no longer fit
the canonical wire domain.
