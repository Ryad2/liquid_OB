# `@liquid-ob/curve-math`

Shared maker and frontend SDK for the Liquid OB proof of concept.

It provides four deterministic boundaries:

- `compilePosition`: turns displayed maker prices, alpha, and inventory into the commitments checked on-chain.
- `quoteExactInput` / `quoteExactOutput`: gives the UI an immediate local preview using the same branch equations.
- `encodePositionPayload`: emits the canonical 269-byte `LOB1` policy payload.
- `buildPositionStrategy`: wraps that payload in the official Aqua/SwapVM order shape and returns its exact strategy hash.

The TypeScript preview uses JavaScript floating-point transcendental functions for responsive UX. The Solidity quoter remains authoritative before signing or execution.
