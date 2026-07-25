# `@liquid-ob/contracts`

Generated, typed contract ABIs and the deployment-manifest trust boundary.

```bash
pnpm contracts:build
pnpm contracts:generate
pnpm --filter @liquid-ob/contracts test
```

Never edit `src/generated/abis.ts` by hand. The generator reads Foundry
artifacts after a successful build. `generate:check` fails when committed ABIs
do not match Solidity.

`parseDeploymentManifest` validates untrusted JSON structurally.
`verifyDeploymentBytecode` additionally checks the selected chain and every
runtime bytecode hash over RPC before live writes are enabled.
