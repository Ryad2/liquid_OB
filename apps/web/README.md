# Liquid OB Web

The current application is an integration harness for the stable frontend
gateway, not the final hackathon UI. It deliberately runs against deterministic
mock state while the curve contracts, solver, Subgraph, and deployments are
being completed.

```bash
pnpm --filter @liquid-ob/web dev
```

All protocol access enters through `src/protocol/client.ts`. Components must
not import mock fixtures, contract ABIs, RPC transports, or GraphQL clients.
The future live composition root will replace that one adapter while preserving
the `LiquidOBFrontendClient` contract.

See `docs/FRONTEND_HANDOFF.md` and `packages/frontend-api/README.md` before
building product screens.
