# Chain Selection And Deployment Rights

Status date: 26 July 2026. This document records the engineering decision and
license gates for the hackathon deployment. It is not legal advice and does
not replace checking the current terms that apply to the deployer.

## Decision

The default public demo network is **Base Sepolia**, chain ID `84532`. Base
mainnet is only an integration-reference fork and must not be used for the
hackathon deployment or assets of value without a separate release decision.

Base is a deployment profile, not a protocol dependency. Chain identity,
contract addresses and deployment blocks live in the generated manifest; the
curve kernel, Aqua/SwapVM extension, solver and frontend do not branch on Base.

## Why Base Sepolia

1. Base is EVM-compatible and its official documentation provides a direct
   Foundry deployment path for Base Sepolia.
2. Base implements the Cancun execution features used by the pinned build,
   including EIP-1153 transient storage. Base disables blob transactions, which
   Liquid OB does not use.
3. The selected Aqua/SwapVM generation already has a reproducible Base-mainnet
   bytecode and behavior proof, reducing dependency uncertainty even though
   the testnet demo deploys the pinned Aqua source itself.
4. Base Sepolia offers inexpensive public transactions, common wallet support
   and an explorer, which fit the live hackathon demonstration.

Primary technical references:

- [Base smart-contract deployment guide](https://docs.base.org/get-started/deploy-smart-contracts)
- [Base network identifiers and RPC endpoints](https://docs.base.org/base-chain/quickstart/connecting-to-base)
- [Base execution specification and Cancun support](https://docs.base.org/base-chain/specs/protocol/execution/index)

The public Base RPC endpoints are rate-limited. They are suitable for manual
verification, not the hosted solver's production traffic; use a dedicated
provider for the API and keep that credential server-side.

## Can We Deploy There?

Technically, yes. Base's documentation explicitly instructs builders to deploy
contracts to Base Sepolia, and its terms describe Base Testnet as an
environment for testing and improving applications built on Base. Coinbase
also states that it does not control what third parties build on Base.

That permission is conditional, not universal. The deployer must be legally
able to accept the current Base terms, must not be prohibited by applicable
law or sanctions, and must comply with acceptable-use requirements. Using the
Sequencer or Base Testnet accepts those terms. See the current
[Base Terms of Service](https://docs.base.org/terms-of-service) immediately
before deployment. Nothing in the repository can certify an individual's
jurisdiction, age, sanctions status or legal capacity.

Base permission also does not grant rights to third-party protocol code. Those
rights come from the Aqua and SwapVM licenses below.

## Aqua And SwapVM Conditions

The pinned Aqua and SwapVM releases use custom Degensoft source licenses, not
MIT or Apache. Their committed texts in [`../LICENSES/`](../LICENSES/README.md)
control over this summary.

For the current non-commercial hackathon prototype, the licenses expressly
allow experimentation, prototyping, hackathons and deployment subject to their
conditions. In this repository:

- upstream source and license notices are preserved;
- the custom instruction, router, scripts and dependent integration tests use
  `LicenseRef-Degensoft-SwapVM-1.1`;
- the README preserves the required Aqua and SwapVM attributions;
- complete source, build instructions and dated change history are public;
- the deployment uses only valueless demo assets and does not charge fees.

The licenses define modifications broadly and impose copyleft on derivative
extensions. They also define commercial use broadly, include fee/liquidity
thresholds and a revocable enforcement waiver for some volume activities.
Therefore this hackathon permission is **not** a production or commercial
clearance. Before charging fees, controlling material liquidity, using real
funds or representing the integration commercially, obtain qualified legal
review and, where required, a written commercial license from Degensoft.

## Network Preflight

The protected deployment workflow checks all of the following before
broadcasting:

- the private deployment RPC reports the requested chain ID;
- the public browser RPC reports the same chain ID;
- both public RPC and explorer URLs use HTTPS;
- an injected Aqua address is present when source deployment is disabled;
- dedicated deployer, maker and taker keys are configured.

After deployment, the manifest generator and independent verifier check chain
identity, runtime bytecode hashes, immutable contract links and `MAX_FILLS`.
The public release gate then verifies the hosted app, Subgraph, API, MCP,
contracts and seeded state from non-local HTTPS endpoints.

## Porting To Another Chain

Another network is acceptable only when all of these are true:

1. It is a public EVM network that supports the Cancun opcodes used by Aqua and
   SwapVM, especially EIP-1153.
2. Current network and RPC terms permit the intended test deployment.
3. Aqua is either available at a reviewed address or deployed from the exact
   pinned source under its license.
4. The Graph deployment target, explorer verification and wallet switching are
   available.
5. The complete deploy, seed, two-route replay, dock and public release gates
   pass again on that chain.

Changing the workflow defaults is not enough by itself; the resulting public
manifest is the authoritative network record.
