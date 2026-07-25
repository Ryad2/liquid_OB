# Liquid OB Solver API

Stateless best-execution orchestration over the native Liquid OB Subgraph and
the deployed contracts.

## Trust Pipeline

1. Fetch every active market side from The Graph at one indexed block.
2. Reject indexing errors or excessive block lag.
3. Solve globally with `@liquid-ob/solver-core`.
4. Refresh selected positions plus a reserve shortlist in one Lens call.
5. Re-solve with current versions, logical reserves and backing status.
6. Refresh every selected fill through the on-chain Quoter.
7. Encode BatchExecutor calldata and, for `/v1/route`, run `eth_call` plus gas
   estimation from the supplied payer.

The solver is permissionless and untrusted. It owns no key, submits no
transaction and cannot bypass deadline, expected-version, amount-limit or
atomic rollback checks.

## Endpoints

- `GET /v1/health`: chain head, indexed block, lag and indexing status.
- `POST /v1/quote`: refreshed unsigned route without final taker simulation.
- `POST /v1/route`: the same route, required to pass complete BatchExecutor
  simulation before it is returned as executable.

Example body:

```json
{
  "marketId": "0x...",
  "side": "sell",
  "kind": "exact-input",
  "amount": "10000000000000000000000",
  "slippageBps": 50,
  "payer": "0x...",
  "recipient": "0x...",
  "refundRecipient": "0x...",
  "deadlineSeconds": 600
}
```

All amounts are unsigned decimal strings in native token units. Every bigint
in the response is also serialized as a decimal string.

## Run

```bash
cp services/solver-api/.env.example services/solver-api/.env
node --env-file=services/solver-api/.env \
  services/solver-api/node_modules/tsx/dist/cli.mjs \
  services/solver-api/src/main.ts
```

For the submitted demo this process must be hosted publicly. Localhost is only
a development fallback.
