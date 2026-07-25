# Prompt 0004: Complete product architecture

## Date

25 July 2026

## Product decisions

- Expose one curve family parameterized by signed `alpha`, not multiple named
  curve modes.
- Permit every `alpha` value that is representable and numerically safe.
- Evaluate `alpha = 0` through its exact continuous limit.
- Treat `startPrice == endPrice` as a standard flat price-and-volume order.
- Model a maker position as one sell curve and one buy curve.
- After every execution, credit the full received asset to the opposite curve
  and rescale that curve deterministically.
- Route taker orders across the best combination of all eligible live
  positions, with offchain discovery and optimization followed by exact
  onchain verification and atomic settlement.

## Requested output

Produce a complete end-to-end specification covering the product, mathematics,
state, contracts, Aqua/SwapVM settlement, solver, The Graph data path, SDK,
interface, tests, deployment, security boundaries, and bounty mapping.

The resulting specification is stored in `docs/PRODUCT_SPEC.md`.
