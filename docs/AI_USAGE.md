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

## 25 July 2026: curve-family correction

- Tool: OpenAI Codex
- Work: removed an incorrect piecewise-linear proposal from the execution plan
  and restored the exact Richardson bounding-curve state, equations, branch
  model, solver requirements, tests, and demo language.
- Human decision: the project owner explicitly required the Richardson curve
  family and rejected any segmented approximation.
- Human review required: single-curve orientation, fixed-point domains,
  Aqua/SwapVM state mapping, and whether Section 7.1 pair coupling belongs in a
  later milestone.

Material future specifications and implementation plans are stored in
`prompts/`. Routine autocomplete and formatting do not need separate entries.
