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
