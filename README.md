# Liquid OB

Liquid OB explores a functional order book in which makers publish bounded,
executable pricing curves instead of only flat price-and-size orders.

## Status

This repository was initialized from an empty GitHub repository on 25 July
2026 during ETHGlobal Lisbon. It currently contains project scaffolding only.
No protocol implementation has been written yet.

Protocol work will be introduced through small, reviewable commits. External
tools and dependencies are recorded as they are introduced.

The current execution plan is documented in
[`docs/HACKATHON_PLAN.md`](docs/HACKATHON_PLAN.md).

The complete end-to-end implementation architecture and protocol-integration
map is documented in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

The decision to keep Uniswap v4 custom accounting as a post-MVP alternative,
rather than the hackathon settlement core, is documented in
[`docs/UNISWAP_V4_HOOK_EVALUATION.md`](docs/UNISWAP_V4_HOOK_EVALUATION.md).

The complete product and protocol specification is documented in
[`docs/PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md).

The normative fixed-point and exchange-rate model is documented in
[`docs/MATH_SPEC.md`](docs/MATH_SPEC.md).

The independent derivation and validation record is documented in
[`docs/MATH_AUDIT.md`](docs/MATH_AUDIT.md).

The working Uniswap developer feedback document is available in
[`FEEDBACK.md`](FEEDBACK.md) and will be finalized before submission.

## Workspace

- `contracts/`: Foundry workspace for EVM contracts and tests.
- `apps/web/`: React and TypeScript demo application.
- `packages/`: Shared TypeScript packages such as the future SDK.
- `services/`: Offchain services such as the future solver or API proxy.
- `docs/`: design decisions, provenance, security notes, and integration logs.
- `prompts/`: material AI-assisted specifications and implementation plans.

## Prerequisites

- Node.js 24.18.0
- pnpm 10.32.1
- Foundry stable

With `asdf` installed, run:

```bash
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
```

## Security

This is hackathon software and is not production-ready or audited. Do not use
it with assets of value. See `SECURITY.md` before reporting a vulnerability.

## License

No license has been selected yet. A license will be chosen explicitly before
the first protocol implementation is published. Third-party dependencies keep
their respective licenses.
