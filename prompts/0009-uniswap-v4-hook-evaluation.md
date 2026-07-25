# Prompt 0009: Uniswap v4 Hook Evaluation

Date: 25 July 2026

## Request

Determine whether implementing Liquid OB as a Uniswap v4 hook would be a better
architecture than the accepted Aqua/SwapVM design.

## Required Comparison

- Exact representation of independent maker curves.
- Custom-accounting and flash-accounting capabilities.
- Maker deposits, custody, withdrawals, and solvency.
- Multi-maker settlement gas potential.
- The Graph and solver requirements.
- Callback, return-delta, and custom-math security.
- Uniswap distribution assumptions.
- Current standard-track and sponsor-bounty consequences.
- Feasibility of a hybrid Aqua-inside-hook design.

## Decision

A v4 custom-accounting hook is technically viable and merits an independent
post-MVP backend experiment. It is not a better hackathon core: nesting Aqua in
a hook combines incompatible settlement surfaces, while replacing Aqua loses
the strongest direct sponsor integration and requires a new pooled backing and
maker-solvency ledger. Keep the accepted Aqua/SwapVM architecture for the MVP.

The complete analysis is recorded in
`docs/UNISWAP_V4_HOOK_EVALUATION.md`.
