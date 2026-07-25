# Contracts

Foundry workspace for Liquid OB settlement contracts.

Phase 1 pins and compiles the official Aqua/SwapVM dependencies and includes a
test-only fixed-rate instruction. The integration suite proves static quoting,
real maker/taker ERC-20 settlement, atomic rollback, and strategy docking both
locally and on an optional official Base fork.

Phase 2 freezes the protocol's unit types, position and route structs, errors,
events, public interfaces, domain-separated identifiers, and compact immutable
policy payload. Its exact 269-byte version 1 layout and reference hash are in
[`../docs/WIRE_FORMAT.md`](../docs/WIRE_FORMAT.md).

Solidity dependencies are immutable Git submodules under `lib/`; initialize
them with `git submodule update --init --recursive` before running Foundry.

The fixed-rate router is a disposable dependency probe, not Liquid OB pricing
logic and not a production deployment target. The Phase 2 codec validates
structural canonicality only; curve commitment correctness begins with the
independent reference oracle and mathematical kernel.
