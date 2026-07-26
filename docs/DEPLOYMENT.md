# Deployment And Demo Runbook

Status: executable Phase 10 runbook. Local Anvil proves reproducibility; an
ETHGlobal live claim requires the same flow against a public chain and a
committed `deployments/<chainId>.json` manifest.

## 1. Build And Validate

```bash
pnpm contracts:generate
pnpm contracts:generate:check
forge test --root contracts --match-contract DeployLiquidOBTest -vv
```

The deployment topology is immutable:

```text
Aqua
  -> LiquidOBCurveKernel
  -> LiquidOBSwapVMRouter(curveKernel, owner)
       -> LiquidOBQuoter
       -> LiquidOBLens
       -> LiquidOBBatchExecutor(maxFills)
```

The router owner can only use inherited rescue functionality. It cannot edit a
maker curve, runtime, quote, allocation or route.

## 2. Select Aqua Mode

Use exactly one mode:

- `LIQUID_OB_DEPLOY_AQUA=false` and `LIQUID_OB_AQUA=<reviewed address>` reuses
  an official deployment already present on the target chain.
- `LIQUID_OB_DEPLOY_AQUA=true` and an empty `LIQUID_OB_AQUA` deploy the pinned
  official Aqua source from the repository. This is useful on a testnet where
  no reviewed address exists.

Both modes use the official Aqua contract and custom SwapVM router. Never set
both an address and the deploy flag.

## 3. Public Deployment

Load a local `.env` that is ignored by Git. Use a dedicated testnet key and
valueless assets only.

```bash
set -a
source .env
set +a

forge script contracts/script/DeployLiquidOB.s.sol:DeployLiquidOB \
  --root contracts \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  --verify \
  --etherscan-api-key "$BASESCAN_API_KEY" \
  -vvvv
```

The command fails before broadcast for a zero owner, invalid `maxFills`,
conflicting Aqua configuration or an injected Aqua address without bytecode.
After broadcast it verifies every immutable dependency link. `forge build
--root contracts --sizes` must also pass; the current Router and CurveKernel
are both below EIP-170.

## 4. Generate The Trusted Manifest

```bash
pnpm deployment:manifest -- \
  --broadcast contracts/broadcast/DeployLiquidOB.s.sol/84532/run-latest.json \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --chain-id 84532 \
  --network-name "Base Sepolia" \
  --explorer-url https://sepolia.basescan.org \
  --public-rpc-url https://sepolia.base.org \
  --public true \
  --max-fills 8 \
  --out deployments/84532.json
```

When Aqua was injected rather than deployed in the same broadcast, append
`--aqua "$LIQUID_OB_AQUA"`. The generator confirms RPC chain identity, fetches
every runtime bytecode, records its Keccak-256 hash, captures transaction/block
evidence and embeds the exact Git commit. It stores no deployment key or
private RPC URL.

Commit the public manifest only after opening every explorer address and
running `parseDeploymentManifest` plus `verifyDeploymentBytecode`.

## 5. Seed Three Maker Curves

Copy deployed addresses from the manifest into the command environment. The
demo token faucet is permissionless and the assets are intentionally
valueless.

```bash
forge script contracts/script/SeedDemoPositions.s.sol:SeedDemoPositions \
  --root contracts \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  -vvvv
```

The script publishes three immutable two-sided strategies: a general signed
alpha position, singular alpha branches, and conventional flat order-book
levels. The initial allocations exactly match their logical outgoing reserves.

## 6. Replay The Multi-Maker Demo Twice

Set `DEMO_MAKER` to the address derived from `MAKER_PRIVATE_KEY`, then run:

```bash
forge script contracts/script/ReplayDemoRoute.s.sol:ReplayDemoRoute \
  --root contracts \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  -vvvv
```

Run the same command again. It reads current versions, rebuilds exact strategy
bytes, quotes both selected positions, applies aggregate slippage, and executes
one atomic split route. The second run proves state/version progression rather
than replaying a stale fixture.

## 7. Dock And Reseed

```bash
forge script contracts/script/DockDemoPositions.s.sol:DockDemoPositions \
  --root contracts \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --broadcast \
  -vvvv
```

Docking is final for an immutable strategy hash. To reset the demo, increment
`DEMO_EPOCH`, run the seed script again, and use that same epoch for replay and
dock. This creates new salts without editing or reviving the old strategies.

## 8. Verification Evidence

Before the live demo, retain:

- source commit and public deployment manifest;
- explorer links for Aqua, Router, Quoter, Lens and BatchExecutor;
- three `Shipped` transactions;
- two successful `RouteExecuted` transactions with linked `CurveFilled` logs;
- one `Docked` transaction on the current or a disposable epoch;
- hosted frontend, Subgraph and solver URLs once their later phases are live.

An Anvil transcript is useful engineering evidence but is never presented as
the required public deployment.

## 9. Automated Testnet Promotion

The manual GitHub workflow `.github/workflows/deploy-testnet.yml` runs the
contract release gates, deploys the immutable topology, optionally verifies it
on the explorer, creates and independently verifies the manifest, seeds three
positions, executes two stateful routes, uploads broadcast evidence and opens a
manifest review PR. Configure these protected `testnet` environment secrets:

```text
TESTNET_RPC_URL
TESTNET_DEPLOYER_PRIVATE_KEY
TESTNET_MAKER_PRIVATE_KEY
TESTNET_TAKER_PRIVATE_KEY
BASESCAN_API_KEY                 # optional when explorer verification is unavailable
```

Use dedicated valueless keys. Review every explorer address and bytecode hash
before merging the generated manifest; workflow success is not approval by
itself.

After the manifest is merged, run `deploy-subgraph.yml` with
`GRAPH_DEPLOY_KEY`, the exact chain ID/network and Subgraph Studio slug. The
workflow derives contract addresses and start blocks from the committed
manifest before codegen, build and deployment.

## 10. Hosted Services

`publish-images.yml` publishes immutable-SHA and `latest` images for:

- `solver-api`: Graph discovery, Lens/Quoter refresh, product reads and final
  route simulation;
- `liquidity-mcp`: four read-only executable-liquidity tools over Streamable
  HTTP;
- `web`: prebuilt ArcBook assets with the final chain, RPC, manifest and API
  URLs embedded at build time.

The Dockerfiles run as unprivileged users. API and MCP healthchecks use
dependency-aware `/readyz`; the web image uses `/healthz`. Terminate TLS at the
hosting platform and never expose private Graph/RPC keys through `VITE_`
variables.

For a local container rehearsal only:

```bash
cp services/solver-api/.env.example services/solver-api/.env
cp services/liquidity-mcp/.env.example services/liquidity-mcp/.env
docker compose -f compose.demo.yaml up --build
```

This Compose topology is not finalist evidence because its URLs are local.

## 11. Public Release Gate

Set only public HTTPS endpoints, then run:

```bash
PUBLIC_APP_URL=https://app.example \
PUBLIC_API_URL=https://api.example \
PUBLIC_MANIFEST_URL=https://app.example/deployments/84532.json \
PUBLIC_SUBGRAPH_URL=https://gateway.thegraph.com/api/KEY/subgraphs/id/ID \
PUBLIC_MCP_URL=https://mcp.example \
PUBLIC_RPC_URL=https://rpc.example \
pnpm release:verify
```

The gate rejects localhost and private networks, then checks CSP, manifest/API
identity, service readiness, fresh writable bootstrap, at least three backed
positions, indexed route evidence, Graph health, MCP protocol identity, RPC
chain ID and runtime bytecode for every contract. The scheduled
`public-smoke.yml` workflow runs the same gate hourly from GitHub environment
variables.

## 12. Owner-Controlled Final Steps

Automation cannot select the repository license, create service accounts,
approve explorer transactions, supply firsthand Uniswap feedback, record a
video or submit ETHGlobal forms. Those are intentional manual release gates.
Do not claim public readiness until each resulting URL and transaction is
recorded and `pnpm release:verify` passes from outside the team network.
