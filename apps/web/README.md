# Liquid OB Web

ArcBook is the Liquid OB maker/taker demo application. It supports a
deterministic local mock and a fail-closed live mode backed by the public
manifest, Solver API, exact curve math and injected EIP-1193 wallet.

```bash
pnpm --filter @liquid-ob/web dev
```

All protocol access enters through `src/protocol/client.ts`. Components do not
import fixtures, contract ABIs, RPC transports, or GraphQL clients. Live mode
never silently falls back to mock mode.

Mock development:

```bash
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @liquid-ob/web dev
```

Live mode requires `VITE_PROTOCOL_MODE=live`, the expected chain ID, a
browser-safe public RPC URL, an immutable public manifest URL and a public
Solver API URL. Writes remain disabled unless the manifest is marked public,
the API is fresh, all addresses agree and the connected wallet is on the exact
chain.

See `docs/FRONTEND_HANDOFF.md` and `packages/frontend-api/README.md` before
building product screens.
