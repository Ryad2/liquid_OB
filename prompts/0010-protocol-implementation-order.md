# Prompt 0010: Complete Protocol Implementation Order

Date: 25 July 2026

## Request

Now that all protocol bricks have been identified, define the perfect order in
which to implement the complete Liquid OB product end to end.

## Required Output

- Dependency-ordered phases rather than a feature wishlist.
- Exact module and file order where useful.
- Entry and exit gates for every phase.
- Unit, differential, fuzz, invariant, integration, fork, Subgraph, solver,
  web, and deployed E2E requirements.
- Correct placement of Aqua, SwapVM, The Graph, solver, UI, MCP, operations, and
  submission work.
- A small, independently green commit sequence.
- Explicit anti-patterns and the immediate next implementation action.

## Decision

The critical path begins with pinned official Aqua/SwapVM compilation and one
real transfer smoke test, then freezes types and independent math vectors,
implements the pure kernel, proves one position, completes recycling and
batching, freezes and deploys contracts, implements the pure solver, indexes
native micro-pools, connects the live solver, builds the UI, and only then adds
the reusable Graph MCP and submission polish.

The normative plan is recorded in `docs/IMPLEMENTATION_ORDER.md`.
