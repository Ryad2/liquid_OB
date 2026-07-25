# Bonding Curve and Effective Price Audit

Re-audit the complete mathematical kernel before implementation, with special
attention to concepts that are easy to conflate.

Required work:

- Distinguish the maker-facing marginal-price schedule, the integrated
  token-coordinate bonding curve, and the finite-fill effective price.
- Derive the bonding curve directly from `dy/dx = -P`, without assuming the
  compact encoded formulas are correct.
- Verify the general signed-alpha branch and the exact `alpha = 0` and
  `alpha = 1` limits.
- Verify that effective price is the secant slope of the actual fill and uses
  current pre-fill and post-fill marginal rates for partial execution.
- Verify buy and sell display/native conversion, including reciprocal rates and
  the shape-parameter sign change.
- State explicitly which outgoing inventory defines normalized progress on
  each side.
- Compare direct high-precision integration against the power-difference mean,
  compact coordinate forms, derivatives, endpoints, and exact inverse maps.
- Correct specifications rather than preserving ambiguous terminology.

Do not claim that product-level recycling, multi-maker routing, settlement, or
fees follow from the correctness of a single bonding curve.
