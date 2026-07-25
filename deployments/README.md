# Deployment Manifests

`<chainId>.json` is the only address source accepted by live clients. A public
manifest records network identity, source commit, deployment evidence,
constructor configuration and the Keccak-256 runtime bytecode hash of every
contract. It never contains a private RPC URL, API key or deployer key.

Generate a manifest from a successful Foundry broadcast:

```bash
pnpm --filter @liquid-ob/contracts manifest -- \
  --broadcast contracts/broadcast/DeployLiquidOB.s.sol/84532/run-latest.json \
  --rpc-url "$BASE_SEPOLIA_RPC_URL" \
  --chain-id 84532 \
  --network-name "Base Sepolia" \
  --explorer-url https://sepolia.basescan.org \
  --public-rpc-url https://sepolia.base.org \
  --public true \
  --out deployments/84532.json
```

The generator queries every deployed address over RPC before writing. The live
adapter must still call `verifyDeploymentBytecode` at startup and fail closed
on a chain or bytecode mismatch.
