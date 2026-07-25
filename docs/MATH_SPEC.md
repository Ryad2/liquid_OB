# Liquid OB Mathematical Kernel

## 1. Units and Orientation

Every market has a base token and a quote token. The interface displays price
in quote units per base unit. The onchain kernel instead uses a native
single-reserve orientation:

```text
x = incoming token coordinate
y = outgoing token reserve
P = -dy/dx = marginal output per unit of input
```

Only `y` is a token reserve. `x` is the derived conjugate coordinate. A trade
adds `x` and removes `y`, so `deltaX > 0`, `deltaY < 0`, and:

```text
P_effective = -deltaY / deltaX
```

`P` and `P_effective` are different quantities. `P` is the slope at one
state. `P_effective` is the positive secant slope between two states. Neither
is the reserve curve itself.

This output-per-input convention is mandatory throughout Solidity, the SDK,
the solver, tests, and event data. Conversion to quote-per-base happens only at
the market boundary. Kernel effective rates exclude protocol fees, solver fees,
and gas; any all-in user quote must report those separately.

The exact ABI representations are frozen in `docs/WIRE_FORMAT.md`: curve
amounts, displayed prices, native rates, and dimensionless values use unsigned
128-bit WAD fields; maker-facing alpha uses signed 128-bit WAD; transfer amounts
remain raw `uint256` token units. Mathematical formulas below describe real
values, while implementation applies the directional rounding contract from
that wire specification.

### 1.1 Integer Arithmetic Contract

`FullPrecisionMath` evaluates an unsigned rational product as:

```text
Down(x*y/d) = floor(x*y/d)
Up(x*y/d)   = ceil(x*y/d)
```

using the complete 512-bit product. A zero denominator, a result outside
`uint256`, or a ceiling above `uint256.max` reverts. Signed operations use the
same mathematical meanings, not Solidity's truncation-toward-zero convention:

```text
Down(-10/6) = -2
Up(-10/6)   = -1
```

All WAD multiplication, division, and reciprocal helpers require an explicit
rounding argument. Signed magnitude conversion supports `int256.min` exactly
and rejects a result outside the asymmetric signed range.

Raw ERC-20 normalization is restricted to `0 <= decimals <= 18`:

```text
amountWad = rawAmount * 10^(18-decimals)
```

This direction is exact and must fit the canonical `uint128 AmountWad` domain.
The reverse conversion divides by the same factor and applies the caller's
explicit floor or ceiling. Reserve addition, subtraction, and proportional
rescaling also reject uint128 overflow or underflow rather than truncating.

## 2. User-Facing Marginal Schedule

One side is configured as:

```text
Side(side, startPrice, endPrice, alpha, reserve)
```

`startPrice` and `endPrice` are displayed quote-per-base marginal prices.
`reserve` is the side's outgoing token. Let `t` be the fraction of the current
outgoing-inventory scale that has been consumed:

```text
t = 1 - y / yInt
```

Consequently, `t` measures quote spent on a buy side and base sold on a sell
side. It is not cumulative base volume on both sides.

The displayed marginal path is the weighted Holder path:

```text
p_alpha(t) = ((1-t) * startPrice^alpha
              + t * endPrice^alpha)^(1/alpha)       if alpha != 0

p_0(t)     = startPrice^(1-t) * endPrice^t           if alpha = 0
```

This function is a marginal-price schedule. It is not the bonding curve and it
must not be used directly as a token-reserve invariant. The bonding curve is
obtained only after direction conversion and integration as defined below.
The schedule is one continuous family; internal formula dispatch does not
create maker-facing curve modes.

A buy side starts with a high bid and moves lower:

```text
startPrice > endPrice > 0
```

A sell side starts with a low ask and moves higher:

```text
0 < startPrice < endPrice
```

Equal endpoint prices select the exact flat-order extension described below.

## 3. Compilation to the Native Marginal Schedule

The buy side releases quote and receives base. Its displayed price is already
native output per input:

```text
buy.PHigh       = startPrice
buy.PLow        = endPrice
buy.alphaNative = alpha
```

The sell side releases base and receives quote. Its native rate is the
reciprocal displayed price. Holder reciprocity requires a sign change:

```text
sell.PHigh       = 1 / startPrice
sell.PLow        = 1 / endPrice
sell.alphaNative = -alpha
```

The identity is:

```text
1 / p_alpha(t; p0, p1)
    = p_-alpha(t; 1/p0, 1/p1)
```

Both directions therefore satisfy:

```text
0 < PLow < PHigh
P_native(t) = ((1-t) * PHigh^alphaNative
               + t * PLow^alphaNative)^(1/alphaNative)
```

with the geometric limit at `alphaNative = 0`.

## 4. Actual Bonding Curve

Write:

```text
a    = alphaNative
H    = PHigh
L    = PLow
A(t) = (1-t) * H^a + t * L^a
```

The native marginal schedule is `P(t) = A(t)^(1/a)`, with its geometric
limit at `a = 0`. The actual curve in token coordinates is the parametric
graph:

```text
y(t) = yInt * (1-t)
x(t) = yInt * integral from 0 to t of (1 / P(s)) ds
```

Therefore:

```text
dx/dt = yInt / P(t)
dy/dt = -yInt
dy/dx = -P(t)
```

For `a` outside `{0, 1}`, the integrated coordinate is:

```text
x(t) = yInt * a/(a-1)
       * (A(t)^((a-1)/a) - H^(a-1))
       / (L^a - H^a)
```

The exact singular branches are:

```text
x_1(t) = yInt/(H-L) * ln(H / P_1(t))

x_0(t) = yInt/(H * ln(H/L)) * ((H/L)^t - 1)
```

The reserve-form bonding curve is `x = x_E(y)`; the forward graph is its exact
inverse `y = y_E(x)`. The closed forms in the native-coordinate section are a
compact reparameterization of this integral, not a different curve family.

Equivalently, set `b = a - 1` and `xInt = x(1)`. In the conjugate orientation:

```text
P_b(x) = ((x/xInt) * L^b + (1-x/xInt) * H^b)^(1/b)
y(x)   = integral from x to xInt of P_b(u) du
```

with the geometric limit at `b = 0`. This forward integral and the reciprocal
reserve integral above describe the same graph only because `a - b = 1`.

## 5. Dual Parameter and Finite-Traversal Law

The native reserve-oriented parameter is `alphaNative`. Its conjugate
coordinate parameter is not independent:

```text
betaNative = alphaNative - 1
```

The `y`-oriented marginal schedule uses `alphaNative`; the derived `x` coordinate
uses `betaNative`. This relation is required for the two coordinate functions
to be mutual inverses.

For a traversal from progress `t0` to `t1`, with `t1 > t0`, define the native
marginal rates immediately before and after that fill:

```text
PBefore = P_native(t0)
PAfter  = P_native(t1)
```

The curve-only native effective rate is:

```text
P_effective
  = yInt * (t1-t0) / (x(t1)-x(t0))
  = (1/(x1-x0)) * integral from x0 to x1 of P_b(x) dx
  = 1 / ((1/(t1-t0)) * integral from t0 to t1 of (1/P(t)) dt)
```

where `x0 = x(t0)` and `x1 = x(t1)`. It is simultaneously the arithmetic
average of the native marginal rate over incoming-coordinate progress and the
harmonic average over outgoing-reserve progress. Because both marginal
schedules are dual Holder paths, the integrals have the exact endpoint form:

```text
P_effective = D_up_alphaNative(PBefore, PAfter)
            = D_down_betaNative(PBefore, PAfter)
```

For `alphaNative` outside `{0, 1}`:

```text
D_up_alpha(a, b)
  = ((alpha - 1) / alpha)
    * ((a^alpha - b^alpha)
       / (a^(alpha-1) - b^(alpha-1)))
```

The exact continuous limits are:

```text
D_up_1(a, b) = (a - b) / (ln(a) - ln(b))

D_up_0(a, b) = a * b * ln(a / b) / (a - b)
```

In displayed quote-per-base units, let `pBefore` and `pAfter` be the marginal
prices around the specific fill. The two sides expose the dual laws:

```text
buy effective price  = D_up_alpha(pBefore, pAfter)
sell effective price = D_down_alpha(pBefore, pAfter)
```

Configured `startPrice` and `endPrice` may replace `pBefore` and `pAfter` only
for a traversal of the entire freshly armed side. A partial fill, or a fill
after prior execution, must use its actual pre-fill and post-fill marginal
prices.

For displayed sell `alpha` outside `{-1, 0}`:

```text
D_down_alpha(a, b)
  = (alpha / (alpha + 1))
    * ((a^(alpha+1) - b^(alpha+1))
       / (a^alpha - b^alpha))
```

Its `alpha = 0` limit is logarithmic and its `alpha = -1` limit is harmonic
logarithmic:

```text
D_down_0(a, b)  = (a - b) / (ln(a) - ln(b))
D_down_-1(a, b) = a * b * ln(a / b) / (a - b)
```

All power-difference expressions use the continuous diagonal value
`D(a, a) = a`. Useful checkpoints, not separate modes, are:

| Effective mean | Buy alpha | Sell alpha |
| --- | ---: | ---: |
| Arithmetic | 2 | 1 |
| Logarithmic | 1 | 0 |
| Geometric | 0.5 | -0.5 |
| Harmonic-logarithmic | 0 | -1 |
| Harmonic | -1 | -2 |

The full-domain intercept ratio is:

```text
yInt / xInt = D_up_alphaNative(PLow, PHigh)
```

For example, a buy schedule with displayed `alpha = 0` traversed from `200` to
`100` has effective price `138.629436...`, not the geometric midpoint
`141.421356...` and not the arithmetic midpoint `150`. A sell schedule with
the same displayed `alpha` traversed from `100` to `200` has effective price
`144.269504...`. The difference follows from which token quantity is linear in
the progress coordinate.

## 6. Reduced Native Encoding

A non-flat side is encoded as:

```text
E = (y, yInt, alphaNative, mu, kappa)
```

`y` is the live Aqua reserve. `yInt` is mutable runtime scale. The remaining
fields are immutable for one position nonce.

A fresh side starts at `PHigh`, so `y = yInt`. A generalized interior
initializer may instead accept `PMarginal` with
`PLow < PMarginal <= PHigh` and recover scale as:

```text
yInt = y * ln(PHigh / PLow) / ln(PMarginal / PLow)
                                                    if alphaNative = 0

yInt = y * (PHigh^alphaNative - PLow^alphaNative)
         / (PMarginal^alphaNative - PLow^alphaNative)
                                                    otherwise
```

The hackathon UI uses fresh boundary initialization. Supporting the generalized
initializer in the codec is optional unless a seeded demo position needs an
interior starting state.

The dimensionless range value is:

```text
mu = 1 - (PLow / PHigh)^alphaNative       if alphaNative > 0
mu = ln(PHigh / PLow)                     if alphaNative = 0
mu = 1 - (PHigh / PLow)^alphaNative       if alphaNative < 0
```

For `alphaNative` outside `{0, 1}`:

```text
gamma = abs((alphaNative - 1) / alphaNative)
```

The scale value is:

```text
kappa = mu * gamma * PHigh    if alphaNative > 0 and alphaNative != 1
kappa = mu * PHigh            if alphaNative = 1
kappa = mu * PLow             if alphaNative = 0
kappa = mu * gamma * PLow     if alphaNative < 0
```

Boundary-rate reconstruction is:

```text
(PLow, PHigh)
  = (kappa/(mu*gamma) * (1-mu)^(1/alphaNative),
     kappa/(mu*gamma))                              if alphaNative > 1

  = (kappa/mu * (1-mu), kappa/mu)                  if alphaNative = 1

  = (kappa/(mu*gamma) * (1-mu)^(1/alphaNative),
     kappa/(mu*gamma))                              if 0 < alphaNative < 1

  = (kappa/mu, kappa/mu * exp(mu))                 if alphaNative = 0

  = (kappa/(mu*gamma),
     kappa/(mu*gamma) * (1-mu)^(1/alphaNative))    if alphaNative < 0
```

Although this is one family, a sign-safe fixed-point evaluator has five
internal regions:

```text
alphaNative > 1
alphaNative = 1
0 < alphaNative < 1
alphaNative = 0
alphaNative < 0
```

The exact `0` and `1` paths are continuous limits, not approximations.

## 7. Native Coordinate Functions

Let:

```text
r = y / yInt
z = 1 - mu * (1 - r)
```

The marginal native rate is:

```text
P_E(y) = kappa/(mu*gamma) * z^(1-gamma)       if alphaNative > 1
P_E(y) = kappa/mu * z                         if alphaNative = 1
P_E(y) = kappa/(mu*gamma) * z^(1+gamma)       if 0 < alphaNative < 1
P_E(y) = kappa/mu * exp(mu*r)                 if alphaNative = 0
P_E(y) = kappa/(mu*gamma) * (1-mu*r)^(1-gamma) if alphaNative < 0
```

The derived incoming-token coordinate is:

```text
x_E(y) = yInt/kappa * (1 - z^gamma)                         if alphaNative > 1
x_E(y) = -yInt/kappa * ln(z)                                if alphaNative = 1
x_E(y) = yInt/kappa * (z^(-gamma) - 1)                      if 0 < alphaNative < 1
x_E(y) = yInt/kappa * (exp(-mu*r) - exp(-mu))               if alphaNative = 0
x_E(y) = yInt/kappa * ((1-mu*r)^gamma - (1-mu)^gamma)       if alphaNative < 0
```

The exact inverse is:

```text
y_E(x) = yInt/mu * ((1-kappa*x/yInt)^(1/gamma) + mu - 1)
                                                        if alphaNative > 1
y_E(x) = yInt/mu * (exp(-kappa*x/yInt) + mu - 1)
                                                        if alphaNative = 1
y_E(x) = yInt/mu * ((1+kappa*x/yInt)^(-1/gamma) + mu - 1)
                                                        if 0 < alphaNative < 1
y_E(x) = -yInt/mu * ln(exp(-mu) + kappa*x/yInt)
                                                        if alphaNative = 0
y_E(x) = yInt/mu * (1 - ((1-mu)^gamma + kappa*x/yInt)^(1/gamma))
                                                        if alphaNative < 0
```

Implementations must use full-precision signed fixed-point operations and
branch-specific domain checks before every power, logarithm, and exponential.

## 8. Exact Swap Maps

For exact output `amountOut`:

```text
yAfter  = y - amountOut
amountIn = x_E(yAfter) - x_E(y)
```

For exact input `amountIn`:

```text
xAfter   = x_E(y) + amountIn
yAfter   = y_E(xAfter)
amountOut = y - yAfter
```

The admissible domain is:

```text
0 <= yAfter <= yInt
0 <= xAfter <= x_E(0)
```

Required input rounds up. Delivered output rounds down. State mutation must use
the same rounded amounts transferred at settlement. No swap-time numerical root
solver is required.

## 9. Flat-Order Extension

The strict bounded family assumes `PLow < PHigh`. Liquid OB adds its continuous
equal-endpoint limit explicitly:

```text
buy.PFlat  = displayedPrice
sell.PFlat = 1 / displayedPrice

PLow = PHigh = PFlat
x_E(y) = (yInt - y) / PFlat
```

Therefore:

```text
exact output: amountIn  = amountOut / PFlat
exact input:  amountOut = amountIn * PFlat
```

`alpha` has no economic effect and is canonicalized in the encoded hash. The
UI still displays the correct quote-per-base value after direction conversion.

## 10. Homothetic Recycling

When an active side receives tokens, those tokens become the opposite side's
outgoing reserve. For a nonempty opposite side:

```text
yAfter    = yBefore + received
scale     = yAfter / yBefore
yIntAfter = yIntBefore * scale
```

`alphaNative`, `mu`, and `kappa` do not change. Since all marginal formulas
depend on `y/yInt`:

```text
P_E(scale*y; scale*yInt) = P_E(y; yInt)
```

Since every derived-coordinate formula is linear in `yInt` at fixed `y/yInt`:

```text
x_E(scale*y; scale*yInt) = scale * x_E(y; yInt)
```

Thus recycling preserves current marginal price and normalized progress while
increasing executable capacity. This is a product-level composition of two
independent curves, not an additional single-curve invariant.

If the opposite reserve is zero, proportional scaling is undefined. The MVP
rearms it at its configured start rate with `y = yInt = received`. This rule is
explicit product policy and must be tested separately.

## 11. Solver Consequence

For a requested native output `q`, define the exact cost:

```text
C(q) = x_E(y-q) - x_E(y)
```

Because `P_E` decreases as reserve is consumed:

```text
dC/dq = 1 / P_E(y-q)
```

is nondecreasing. Each exact-output cost is therefore convex for every valid
`alphaNative`. The global exact-output route is a bounded separable convex
allocation problem. The solver equalizes marginal costs across unsaturated
positions, clips exhausted positions, handles flat orders as constant-cost
intervals, then corrects integer rounding onchain.

Discovery and optimization are offchain. Contracts validate only the bounded
selected fill list, exact quotes, nonces, reserves, deadlines, and aggregate
slippage.

## 12. Numerical Safety

The mathematical family accepts every real `alpha`. The EVM implementation
accepts every signed fixed-point `alpha` whose configured rates and intermediate
values stay inside explicitly documented numerical domains. This is a numerical
restriction, not a semantic whitelist.

Near native `alpha = 0` and `alpha = 1`, naive subtraction of nearly equal
powers loses fixed-point precision even though the mathematical limit is well
defined. Implementation must use stable `expm1`/`log1p`-style transformations
or publish conservative rejection bounds. Exact singular values use their
closed forms. No claim that every `int256` bit pattern is executable is valid.

The translated weighted-invariant chart is real without qualification only on
the classical interval `0 < alphaNative < 1`. Outside that interval, signed
bases raised to real powers can leave the real domain. Liquid OB therefore uses
the positive-rate integral and reduced native coordinate formulas for the full
alpha line and never evaluates the translated invariant as swap truth.

Configuration must reject:

- Nonpositive rates.
- Wrong displayed endpoint ordering for the selected side.
- Unsupported token decimals or normalization overflow.
- Power, logarithm, exponential, or multiplication overflow domains.
- A non-flat encoding whose rounded endpoints collapse to equality.
- States outside `0 <= y <= yInt`.

## 13. Required Mathematical Tests

- Differential checks of `P_E`, `x_E`, and `y_E` against high precision.
- Direct integration of `1/P(t)` against the closed-form bonding curve.
- Exact inverse checks `y_E(x_E(y)) = y` within directional rounding.
- Exact-input and exact-output near-inversion.
- Partial-fill effective-rate equality using actual pre-fill and post-fill
  marginal rates, plus the full-range boundary case.
- Continuity around native `alpha = 0` and `alpha = 1`.
- Representative large positive and negative safe `alpha` values.
- Values immediately around native `alpha = 0` and `alpha = 1` at the chosen
  fixed-point resolution.
- Flat-limit correctness and alpha-independence.
- Display/native conversion for buy and sell sides.
- Buy quote-progress and sell base-progress semantics.
- Homothetic price preservation and coordinate scaling.
- Split-versus-combined path consistency.
- Domain, overflow, zero-amount, and reserve-exhaustion reverts.

## 14. Kernel Boundary

The mathematical kernel proves one bounded curve and its inverse coordinate.
It does not define:

- How multiple maker curves are discovered or aggregated.
- How a buy curve and sell curve share received inventory.
- Empty-side rearming policy.
- Aqua custody, SwapVM instructions, or contract authorization.
- Protocol fees, solver incentives, or front-running protection.
- Fixed-point rounding, gas bounds, or token compatibility.

Liquid OB's two-sided recycling, solver, atomic batch, data layer, and
settlement controls are explicit product architecture built around the kernel.
Their correctness requires separate conservation, security, and integration
tests rather than being inferred from single-curve mathematics.
