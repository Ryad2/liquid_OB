# Prompt 0007: End-to-End Implementation Architecture

Date: 25 July 2026

## Request

Identify and explain every brick required to implement the complete Liquid OB
hackathon product, end to end, without implementing those bricks yet. For every
brick, state its responsibility, its relationship to the other modules, and
which external protocol it uses and how.

## Constraints Carried Into The Specification

- One exact signed-alpha bounded curve family.
- Exact alpha-zero and equal-endpoint flat-order branches.
- Two independent maker sides with automatic cross-recycling.
- Offchain global optimization and bounded atomic onchain validation.
- Aqua and SwapVM as load-bearing settlement infrastructure.
- The Graph as live discovery, composability, and reusable tooling.
- No forced Uniswap runtime integration under the project-specific written
  eligibility confirmation; feedback documentation remains mandatory.
- No implementation changes during this architecture-only step.

## Output

The normative architecture, source-of-truth boundaries, onchain and offchain
modules, lifecycle and execution flows, sponsor mapping, security gates,
verification matrix, deployment profiles, workspace target, implementation
order, and MVP definition of done are recorded in
`docs/ARCHITECTURE.md`.
