# `@liquid-ob/solver-core`

Pure deterministic route optimization for ArcBook micro-pools. The package
has no GraphQL, RPC, HTTP, environment, wallet, or filesystem dependency.

It solves exact-input and exact-output orders by equalizing the executable
native marginal rate across bounded curve sides. Flat levels are allocated in
economic order with a stable position-key tie break. If the unconstrained
solution exceeds `maxFills`, candidates are removed one at a time by minimum
objective degradation and the remaining market is solved again.

The result is a transparent route certificate containing every immutable
strategy locator, expected runtime version, per-fill quote, aggregate amounts,
snapshot block and bounded reserve shortlist. The certificate is untrusted
until the networked API refreshes it with Lens/Quoter and simulates the final
BatchExecutor calldata.
