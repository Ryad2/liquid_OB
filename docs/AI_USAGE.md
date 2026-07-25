# AI Usage Disclosure

AI assistance is used as an engineering tool, not as an unreviewed source of
protocol correctness. The repository owner remains responsible for every
design decision, mathematical assumption, test, and submitted line of code.

## 25 July 2026: repository bootstrap

- Tool: OpenAI Codex
- Work: inspected the empty remote, checked official tool documentation,
  proposed the workspace, and generated configuration and documentation
  scaffolding.
- Human review required: repository structure, dependency choices, security
  boundaries, and every future implementation decision.
- Imported implementation during this step: none.

## 25 July 2026: hackathon execution plan

- Tool: OpenAI Codex
- Work: converted the product thesis and current sponsor requirements into a
  time-boxed architecture, implementation sequence, test gates, demo script,
  fallback strategy, and submission checklist.
- Human review required: sponsor eligibility, dependency licenses, curve
  semantics, mathematical assumptions, and every release decision.
- Output: `docs/HACKATHON_PLAN.md` and `prompts/0002-hackathon-plan.md`.

## 25 July 2026: exact curve architecture

- Tool: OpenAI Codex
- Work: documented the exact bounded-curve state, equations, branch model,
  solver requirements, tests, and product-facing demo language.
- Human decision: the project uses one analytical curve family rather than a
  segmented approximation or arbitrary maker-provided code.
- Human review required: single-curve orientation, fixed-point domains,
  Aqua/SwapVM state mapping, and whether active/spectator coupling belongs in a
  later milestone.

## 25 July 2026: Uniswap eligibility update

- Tool: OpenAI Codex
- Work: removed the conditional API adapter from the plan, fixed Uniswap as the
  third partner selection, and created the required feedback-document draft.
- Human-supplied requirement: written sponsor confirmation permits this project
  to apply without a forced API integration, while `FEEDBACK.md` and the
  developer feedback form remain mandatory.
- Human review required: final feedback content, identifying submission note,
  form completion, and private retention of the original confirmation.

## 25 July 2026: end-to-end product specification

- Tool: OpenAI Codex
- Work: specified one `alpha`-parameterized curve family, its zero-order and
  flat-order limits, two-sided maker positions, automatic inventory recycling,
  deterministic rescaling, multi-position solving, settlement, data, UI,
  tests, and sponsor relationships.
- Human decisions: all numerically safe `alpha` values are permitted; received
  assets immediately fund the opposite curve; equal endpoint prices produce a
  standard flat price-and-volume position.
- Human review required: exact fixed-point domains, empty-side rearming,
  maker-favorable rounding, solver optimality, and Aqua/SwapVM accounting.

## 25 July 2026: mathematical kernel audit

- Tool: OpenAI Codex
- Work: independently reconstructed the dual-parameter curve, reduced native
  encoding, exact coordinate maps, singular limits, direction conversion,
  flat-order limit, and homothetic scaling; checked identities numerically at
  80-digit precision across representative alpha values from -20 to 20.
- Corrections: replaced the legacy affine encoding with
  `(y, yInt, alphaNative, mu, kappa)`, restored
  `betaNative = alphaNative - 1`, fixed output-per-input quote semantics, and
  corrected buy/sell compilation.
- Human review required: fixed-point domain constants, production rounding
  policy, and the product-specific empty-side rearming rule.

## 25 July 2026: bonding-curve and effective-price re-audit

- Tool: OpenAI Codex
- Work: independently re-derived the reserve curve by integrating the
  reciprocal marginal schedule; verified secant-rate, dual-mean, reciprocal
  direction, reduced encoding, derivative, and inverse identities at
  90-to-100-digit precision across signed alpha values and both singular
  branches.
- Corrections: renamed the maker function as a marginal schedule, documented
  the actual integrated bonding curve, distinguished buy quote progress from
  sell base progress, and required partial-fill effective prices to use actual
  pre-fill and post-fill marginal rates.
- Human review required: maker-facing parameter vocabulary, fixed-point
  tolerances near singular branches, and all fee-inclusive UI quote semantics.

Material future specifications and implementation plans are stored in
`prompts/`. Routine autocomplete and formatting do not need separate entries.
