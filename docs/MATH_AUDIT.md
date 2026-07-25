# Liquid OB Mathematical Re-Audit

## Status

This audit separates the mathematical kernel from product-level extensions.
It is an independent derivation and high-precision consistency check, not a
formal proof and not a smart-contract audit.

The core bounded single-curve construction is internally consistent. The
previous specification nevertheless had four material presentation defects:

1. It sometimes called the marginal-price schedule the bonding curve.
2. It used configured full-range prices where a partial-fill formula requires
   actual pre-fill and post-fill marginal prices.
3. It conflated marginal `-dy/dx` with effective `-deltaY/deltaX` notation.
4. It did not state that normalized progress measures quote spent for buys and
   base sold for sells.

Those defects are corrected in `MATH_SPEC.md` and `PRODUCT_SPEC.md`.

## Independent Derivation

For one native side, let:

```text
H = PHigh
L = PLow
a = alphaNative
t = 1 - y/yInt
```

The marginal schedule is:

```text
P(t) = ((1-t) * H^a + t * L^a)^(1/a)
```

with the geometric continuous limit at `a = 0`. This is only a slope schedule.
The token-coordinate curve follows from:

```text
dy/dx = -P(t)
y(t)  = yInt * (1-t)
```

and therefore:

```text
x(t) = yInt * integral from 0 to t of (1/P(s)) ds
```

For `a` outside `{0, 1}` this integrates to:

```text
A(t) = (1-t) * H^a + t * L^a

x(t) = yInt * a/(a-1)
       * (A(t)^((a-1)/a) - H^(a-1))
       / (L^a - H^a)
```

The singular branches are:

```text
x_1(t) = yInt/(H-L) * ln(H/P_1(t))
x_0(t) = yInt/(H*ln(H/L)) * ((H/L)^t - 1)
```

Differentiating each branch gives `dx/dt = yInt/P(t)` and hence
`dy/dx = -P(t)`. This identifies `xE(y)` as the inverse-oriented bonding curve
and `yE(x)` as its forward graph.

## Effective Price

For a fill from `t0` to `t1`:

```text
P_effective
  = amountOut / amountIn
  = yInt*(t1-t0) / (x(t1)-x(t0))
  = 1 / average_from_t0_to_t1(1/P(t))
```

This is a secant rate and a harmonic average with respect to outgoing-reserve
progress. In the dual incoming coordinate it is equivalently the arithmetic
average of the dual marginal schedule. It is not generally the midpoint
marginal price.

Let `pBefore` and `pAfter` be displayed quote-per-base marginal prices around
the actual fill. Direction conversion gives:

```text
buy effective price  = D_up_alpha(pBefore, pAfter)
sell effective price = D_down_alpha(pBefore, pAfter)
```

The two displayed laws differ because buy progress is quote expenditure while
sell progress is base delivery. For a complete fresh-side traversal only,
`pBefore` and `pAfter` equal the configured start and end prices.

Example with displayed `alpha = 0`:

| Side | Marginal traversal | Effective price |
| --- | --- | ---: |
| Buy | 200 to 100 | 138.629436111989 |
| Sell | 100 to 200 | 144.269504088896 |

Neither value is the geometric midpoint `141.421356237310` or the arithmetic
midpoint `150`. This is expected, not a contradiction.

## Validation Matrix

| Family | Check | Result |
| --- | --- | --- |
| Units | Marginal derivative and finite secant use output/input | Pass |
| Holder schedule | Positive endpoints remain positive and monotone for every real `alpha` | Pass |
| Reciprocity | Reciprocal endpoints require displayed `alpha -> -alpha` | Pass |
| Dual coordinate | `betaNative = alphaNative - 1` produces inverse coordinate maps | Pass |
| Integral curve | Direct integration of `1/P(t)` matches `xE(y)` | Pass |
| Derivative | `d xE(y)/dy = -1/P_E(y)` | Pass |
| Inverse | `yE(xE(y)) = y` | Pass |
| Traversal | Secant rate matches the power-difference endpoint mean | Pass |
| Singular paths | Exact native `alpha = 0` and `alpha = 1` limits | Pass |
| Economic direction | Buy quote progress and sell base progress match their dual means | Pass |
| Affine invariant | Real without extra parity restrictions only on `0 < alphaNative < 1` | Conditional |
| Flat order | Equal prices are a product-level continuous extension | Separate rule |
| Recycling | Homothetic two-side rescaling is not a single-curve theorem | Separate rule |
| Global solver | Multi-maker optimization is not defined by the single-curve kernel | Separate rule |

## Numerical Evidence

Independent 90-to-100-digit calculations covered representative values from
`alpha = -20` through `alpha = 20`, exact singular values, and values within
`1e-8` of `0` and `1`. They compared direct quadrature against closed forms,
derivatives, inverse maps, endpoint recovery, buy/sell dual means, and
reciprocal compilation. The discrete ask and bid recurrences were also checked
against their required cumulative execution means with positive tranches.

The largest observed residual was below `2e-78`; most were below `6e-90`.
These results detect algebraic and orientation mistakes but do not establish
safe EVM fixed-point bounds. Solidity still requires differential, fuzz,
rounding, overflow-domain, and conservation tests.

## Final Boundary

The verified mathematical claim is one bounded curve with exact marginal,
coordinate, inverse, and finite-traversal laws. It does not by itself prove
two-sided recycling, Aqua accounting, multi-position routing, fee handling,
integer rounding, or adversarial safety. Those remain independent protocol
obligations.
