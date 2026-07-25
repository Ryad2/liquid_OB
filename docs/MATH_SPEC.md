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

This output-per-input convention is mandatory throughout Solidity, the SDK,
the solver, tests, and event data. Conversion to quote-per-base happens only at
the market boundary.

## 2. User-Facing Curve

One side is configured as:

```text
Side(side, startPrice, endPrice, alpha, reserve)
```

`startPrice` and `endPrice` are displayed quote-per-base marginal prices.
`reserve` is the side's outgoing token. Let `t` be consumed inventory fraction:

```text
t = 1 - y / yInt
```

The displayed marginal path is the weighted Holder path:

```text
p_alpha(t) = ((1-t) * startPrice^alpha
              + t * endPrice^alpha)^(1/alpha)       if alpha != 0

p_0(t)     = startPrice^(1-t) * endPrice^t           if alpha = 0
```

This is one continuous family. Internal formula dispatch does not create
maker-facing curve modes.

A buy side starts with a high bid and moves lower:

```text
startPrice > endPrice > 0
```

A sell side starts with a low ask and moves higher:

```text
0 < startPrice < endPrice
```

Equal endpoint prices select the exact flat-order extension described below.

## 3. Compilation to the Native Curve

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

## 4. Dual Parameter and Finite-Traversal Law

The native reserve-oriented parameter is `alphaNative`. Its conjugate
coordinate parameter is not independent:

```text
betaNative = alphaNative - 1
```

The `y`-oriented marginal path uses `alphaNative`; the derived `x` coordinate
uses `betaNative`. This relation is required for the two coordinate functions
to be mutual inverses.

For endpoint native marginal rates `PStart` and `PEnd`, every finite traversal
satisfies:

```text
P_effective = D_up_alphaNative(PStart, PEnd)
            = D_down_betaNative(PStart, PEnd)
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

In displayed quote-per-base units, the two sides expose the dual laws:

```text
buy effective price  = D_up_alpha(startPrice, endPrice)
sell effective price = D_down_alpha(startPrice, endPrice)
```

For displayed sell `alpha` outside `{-1, 0}`:

```text
D_down_alpha(a, b)
  = (alpha / (alpha + 1))
    * ((a^(alpha+1) - b^(alpha+1))
       / (a^alpha - b^alpha))
```

Its `alpha = 0` limit is logarithmic and its `alpha = -1` limit is harmonic
logarithmic. Useful checkpoints, not separate modes, are:

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

## 5. Reduced Native Encoding

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

## 6. Native Coordinate Functions

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

## 7. Exact Swap Maps

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

## 8. Flat-Order Extension

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

## 9. Homothetic Recycling

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

## 10. Solver Consequence

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

## 11. Numerical Safety

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

## 12. Required Mathematical Tests

- Differential checks of `P_E`, `x_E`, and `y_E` against high precision.
- Exact inverse checks `y_E(x_E(y)) = y` within directional rounding.
- Exact-input and exact-output near-inversion.
- Effective-rate equality with the power-difference mean.
- Continuity around native `alpha = 0` and `alpha = 1`.
- Representative large positive and negative safe `alpha` values.
- Values immediately around native `alpha = 0` and `alpha = 1` at the chosen
  fixed-point resolution.
- Flat-limit correctness and alpha-independence.
- Display/native conversion for buy and sell sides.
- Homothetic price preservation and coordinate scaling.
- Split-versus-combined path consistency.
- Domain, overflow, zero-amount, and reserve-exhaustion reverts.

## 13. Kernel Boundary

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
