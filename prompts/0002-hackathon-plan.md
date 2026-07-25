# Prompt 0002: Hackathon execution plan

## Date

25 July 2026

## Objective

Create an end-to-end plan to build and present Liquid OB as a competitive
ETHGlobal Lisbon project. Prioritize the core product and a convincing live
demo over shallow sponsor integrations.

## Constraints

- Treat Liquid OB as a new functional order book, not as a pool AMM.
- Makers publish one exact Liquid OB bounded-curve family parameterized by
  signed `alpha`, including exact analytical limits and the flat-order case.
  Do not substitute named curve modes, piecewise-linear approximations, or
  arbitrary user code.
- Make 1inch Aqua and SwapVM the primary settlement target.
- Do not force a Uniswap API integration. Project-specific written eligibility
  was confirmed by the sponsor team; complete `FEEDBACK.md` and the required
  feedback form instead.
- Use The Graph only where it is load-bearing for live discovery and analytics.
- Preserve a coherent Git history with one verified capability per commit.
- Keep the implementation demonstrable and secure enough for a hackathon, but
  do not represent it as audited or production-ready.

## Requested output

- Frozen MVP scope and architecture.
- Precise curve semantics and correctness properties.
- Ordered milestones with time limits and fallbacks.
- Sponsor strategy and qualification evidence.
- Four-minute demo script and final submission checklist.

The resulting execution plan is stored in `docs/HACKATHON_PLAN.md`.
