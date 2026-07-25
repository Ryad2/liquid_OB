# Liquid OB Subgraph

The Subgraph is the protocol's executable-liquidity discovery layer. Each Aqua
strategy is indexed as one immutable `Position` and two independent
`CurveSide` micro-pools. It is not a decorative analytics index.

## Indexed Sources

- Aqua `Shipped`, `Pushed`, `Pulled`, and `Docked` events create positions and
  maintain virtual allocation/lifecycle state, filtered to the Liquid OB app.
- Router `PositionRuntimeInitialized` and `CurveFilled` events replace the
  complete two-sided logical runtime and version after every fill.
- BatchExecutor `RouteExecuted` events materialize aggregate route history.

The solver discovers candidates through `queries/active-sides.graphql`, reads
the `_meta` indexed block, optimizes locally, then refreshes only a bounded
shortlist against Lens and Quoter. Indexed data never authorizes settlement.

## Local Validation

```bash
forge build --root contracts
pnpm --filter @liquid-ob/subgraph abi:sync
pnpm --filter @liquid-ob/subgraph codegen
pnpm --filter @liquid-ob/subgraph build
```

ABIs are generated from the same Foundry artifacts as the deployment. CI runs
`abi:check` to reject stale event definitions.

## Configure A Public Deployment

After a public deployment manifest exists, generate a chain-specific manifest:

```bash
pnpm --filter @liquid-ob/subgraph configure -- \
  --manifest ../deployments/84532.json \
  --network base-sepolia \
  --out subgraph.base-sepolia.yaml

pnpm --filter @liquid-ob/subgraph exec graph codegen subgraph.base-sepolia.yaml
pnpm --filter @liquid-ob/subgraph exec graph build subgraph.base-sepolia.yaml
pnpm --filter @liquid-ob/subgraph exec graph deploy liquid-ob-base-sepolia \
  subgraph.base-sepolia.yaml
```

Authentication is performed locally with the Subgraph Studio deploy key. It is
never committed. A localhost build is reproducibility evidence only; the final
ETHGlobal demo must use the deployed Graph endpoint.
