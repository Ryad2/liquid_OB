# Liquid OB

Liquid OB explores a functional order book in which makers publish bounded,
executable pricing curves instead of only flat price-and-size orders.

## Status

This repository was initialized from an empty GitHub repository on 25 July
2026 during ETHGlobal Lisbon. The reproducible Aqua/SwapVM integration boundary,
real-transfer smoke tests, and canonical Phase 2 ABI/wire format are complete;
the independent high-precision mathematical oracle and committed Phase 3
vectors are also complete. A typed frontend gateway and deterministic mock now
allow product UI work in parallel. Phase 4A full-precision signed and unsigned
arithmetic is implemented; transcendental math, the Solidity curve kernel, and
the production protocol are not implemented yet.

Protocol work will be introduced through small, reviewable commits. External
tools and dependencies are recorded as they are introduced.

The current execution plan is documented in
[`docs/HACKATHON_PLAN.md`](docs/HACKATHON_PLAN.md).

The complete end-to-end implementation architecture and protocol-integration
map is documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

The dependency-ordered development sequence, exit gates, tests, and intended
commit history are documented in
[`docs/IMPLEMENTATION_ORDER.md`](docs/IMPLEMENTATION_ORDER.md).

The normative units, identifiers, route ABI, event contract, byte offsets, and
version 1 test vector are documented in
[`docs/WIRE_FORMAT.md`](docs/WIRE_FORMAT.md).

The page-by-page ETHGlobal rules audit, public-demo topology, and mandatory
zero-localhost submission gate are documented in
[`docs/ETHGLOBAL_RULES_COMPLIANCE.md`](docs/ETHGLOBAL_RULES_COMPLIANCE.md).

The decision to keep Uniswap v4 custom accounting as a post-MVP alternative,
rather than the hackathon settlement core, is documented in
[`docs/UNISWAP_V4_HOOK_EVALUATION.md`](docs/UNISWAP_V4_HOOK_EVALUATION.md).

The complete product and protocol specification is documented in
[`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md).

The normative fixed-point and exchange-rate model is documented in
[`docs/MATH_SPEC.md`](docs/MATH_SPEC.md).

The independent derivation and validation record is documented in
[`docs/MATH_AUDIT.md`](docs/MATH_AUDIT.md).

The independent `Decimal` oracle, deterministic vector schema, regeneration
procedure, and trust boundary are documented in
[`docs/REFERENCE_MODEL.md`](docs/REFERENCE_MODEL.md).

The exact implemented/missing capability inventory is documented in
[`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md). Frontend
developers should use [`docs/FRONTEND_HANDOFF.md`](docs/FRONTEND_HANDOFF.md)
and [`packages/frontend-api/`](packages/frontend-api/README.md) as their entry
point.

The working Uniswap developer feedback document is available in
[`FEEDBACK.md`](FEEDBACK.md) and will be finalized before submission.

## Workspace

- `contracts/`: Foundry workspace for EVM contracts and tests.
- `apps/web/`: React and TypeScript demo application.
- `packages/`: Shared TypeScript packages such as the future SDK.
- `packages/frontend-api/`: stable UI contract, amount helpers, and mock client.
- `services/`: Offchain services such as the future solver or API proxy.
- `tools/reference/`: development-only high-precision mathematical oracle.
- `test/vectors/`: committed language-neutral protocol vectors.
- `docs/`: design decisions, provenance, security notes, and integration logs.
- `prompts/`: material AI-assisted specifications and implementation plans.

## Prerequisites

- Node.js 24.18.0
- pnpm 10.32.1
- Foundry 1.5.1
- Solidity 0.8.30 (installed automatically by Foundry)
- Python 3.10 or newer (standard library only)

With `asdf` installed, run:

```bash
git submodule update --init --recursive
asdf install
pnpm install --frozen-lockfile
```

## Checks

```bash
pnpm check
pnpm lint
pnpm build
pnpm test
pnpm contracts:fmt
pnpm contracts:lint
pnpm contracts:build
pnpm contracts:test
pnpm reference:test
pnpm reference:check
```

The optional official Base fork proof requires `BASE_MAINNET_RPC_URL`; without
it, that suite is reported as skipped. See
[`docs/DEPENDENCY_AUDIT.md`](docs/DEPENDENCY_AUDIT.md) for the exact command and
verified deployment matrix.

## Security

This is hackathon software and is not production-ready or audited. Do not use
it with assets of value. See `SECURITY.md` before reporting a vulnerability.

## License And Attribution

No root license has been selected for independent Liquid OB code. Files with a
specific SPDX identifier are governed by that license; full Aqua and SwapVM
terms and notices are preserved in [`LICENSES/`](LICENSES/README.md).

Powered by Aqua — © Degensoft Ltd 2025

Powered by SwapVM — © Degensoft Ltd 2025

These are factual integration attributions and do not imply endorsement.
