# Contracts

Foundry workspace for Liquid OB settlement contracts.

Phase 1 pins and compiles the official Aqua/SwapVM dependencies and includes a
test-only fixed-rate instruction. The integration suite proves static quoting,
real maker/taker ERC-20 settlement, atomic rollback, and strategy docking both
locally and on an optional official Base fork.

Solidity dependencies are immutable Git submodules under `lib/`; initialize
them with `git submodule update --init --recursive` before running Foundry.

The fixed-rate router is a disposable dependency probe, not Liquid OB pricing
logic and not a production deployment target. Curve math begins only after
this boundary is stable.
