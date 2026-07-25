# Phase 9 Security Gate

Status date: 25 July 2026. This gate is scoped to a public hackathon deployment
using valueless demo tokens. It is not an external audit and it does not make a
production-funds claim.

## Security Model

Liquid OB separates three inputs that must agree before settlement:

1. the exact ABI-encoded immutable SwapVM strategy and its Aqua hash;
2. the maker, market, curve direction and current runtime version;
3. the solver proposal, aggregate limit, deadline, recipient and funding.

The batch executor recomputes strategy hashes, decodes every order, checks the
maker and market, rejects duplicate positions, bounds the fill count, and binds
each fill to an expected runtime version. The executor is the temporary taker;
it receives exactly the route budget, approves only the router, sends output
directly to the recipient, clears approval, and refunds unused input. A failure
in any fill or in the final aggregate limit reverts the whole transaction.

Aqua remains the settlement authority for maker allocation and lifecycle. A
docked or insufficiently allocated strategy cannot be made executable by a
larger logical reserve in Liquid OB storage. The Lens is diagnostic only and is
never consulted as an authorization source.

## Automated Evidence

The default Foundry suite proves:

- canonical encoding, hash parity and malformed-policy rejection;
- bounded logarithm, exponential and power domains plus numerical intervals;
- exact-input/exact-output quote inversion and two-sided recycling;
- official Aqua ship, pull, push, dock and transaction rollback behavior;
- quote/settlement parity for both maker directions;
- immutable strategy, maker, market and runtime-version binding;
- expired-route, duplicate-position and configured-fill-bound rejection;
- forged strategy-hash, docked and under-allocated position rejection;
- aggregate slippage and later-fill failure rollback, including payer funds;
- exact-output refunds and zero executor token dust after success.

The committed `.gas-snapshot` is a regression baseline, not a claim that the
contracts are globally gas-optimal. CI runs the full suite and compiler/linter
gate on every pushed commit.

## Explicit Token Assumptions

Demo markets support conventional ERC-20 tokens with deterministic `balanceOf`,
`allowance`, `approve`, and transfer behavior, and decimals no greater than 18.
Fee-on-transfer input is rejected by exact funding reconciliation. Rebasing,
ERC-777-style callback behavior, transfer taxes, blacklistable settlement,
malicious metadata and non-standard approval semantics are not supported.

## Frozen Public Surface

The Phase 9 ABI freeze covers these public contracts and constructor shapes:

- `LiquidOBSwapVMRouter(address aqua, address owner)`;
- `LiquidOBQuoter(address router)`;
- `LiquidOBLens(address router)`;
- `LiquidOBBatchExecutor(address router, uint16 maxFills)`.

Position payload version 1 is exactly 269 bytes. Existing fields, identifier
domains, event meanings and exact-input/exact-output rounding semantics must not
change before the demo deployment. Additive view helpers remain possible.

## Residual Risks

- The code has not received an independent smart-contract or numerical audit.
- Transcendental error bounds are engineering-tested against an independent
  high-precision oracle, not formally verified.
- Payload recovery relies on the pinned SwapVM program-offset representation.
- The official dependencies are pinned, but the final public addresses and
  chain behavior still require a deployment smoke test.
- The batch algorithm is intentionally bounded and does not prove solver
  optimality; it only settles a supplied route safely and atomically.
- Private keys, sponsor keys and privileged owner credentials must never enter
  the browser bundle or repository.

Only valueless demo assets are allowed until an external review, public-chain
verification and operational controls are complete.
