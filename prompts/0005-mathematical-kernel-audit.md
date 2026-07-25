# Prompt 0005: Mathematical kernel audit

## Date

25 July 2026

## Objective

Revalidate the complete Liquid OB mathematical kernel against the final private
technical reference before protocol implementation begins.

## Required checks

- Reconstruct the marginal-rate family and its dual coordinate parameter.
- Verify all continuous limits and the full signed-alpha domain.
- Verify the reduced native encoding and exact swap maps.
- Distinguish displayed quote-per-base price from native output-per-input rate.
- Prove the direction transform for buy and sell sides.
- Confirm whether the flat-order extension and homothetic recycling are valid.
- Identify product architecture that is not specified by the single-curve math.
- Correct public product specifications without publishing private source
  material or provenance.

## Result

The normative kernel is stored in `docs/MATH_SPEC.md`. Product composition is
stored in `docs/PRODUCT_SPEC.md`.
