# Prompt 0008: Native Subgraph Solver Path

Date: 25 July 2026

## Request

Clarify why The Graph must index Liquid OB's own positions and state. Every
maker position behaves as an independent pool for routing, so the global solver
must discover and compare them efficiently without one RPC read per position.

## Decision

- Call each position a single-maker programmable micro-pool for computational
  purposes while retaining `Position` as the protocol entity name.
- Index immutable policy, both logical curve states, runtime version, Aqua
  allocation, and lifecycle in the native Liquid OB Subgraph.
- Optimize over the complete indexed snapshot first.
- Refresh only selected fills plus a bounded reserve shortlist through RPC.
- Simulate and revalidate the final route onchain.
- Keep the standardized external DEX Subgraph as a secondary MCP comparison
  source, not as a replacement for native Liquid OB indexing.
