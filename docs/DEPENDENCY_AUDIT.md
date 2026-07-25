# Aqua And SwapVM Dependency Audit

Status: verified on 25 July 2026 for Phase 1 of the implementation order.

This is a technical and reproducibility record, not legal advice.

## Selected Matrix

| Component | Exact selection | Reason |
| --- | --- | --- |
| Aqua contracts | tag `0.1.0`, commit `b51f3b6e3c02fa5208e1429f0f14706b025d9dd6` | This is the Aqua revision declared by the selected SwapVM release. |
| SwapVM contracts | branch `release/1.1`, commit `ac06e1bac021cd1983dc7c44d1f69b4b8861a945`, package `0.0.6` | Current official hackathon release audited for the custom instruction boundary. |
| Aqua SDK | package `@1inch/aqua-sdk@0.2.0`; source reviewed at `1inch/sdks` commit `7172a94c0c8a77031ffef571b158a18c90fc21bb` | Exact package version is locked for later ship/dock and event tooling. |
| 1inch Solidity utilities | tag `6.9.7`, commit `29043f22422fde454951e9733129cce5d67e6a39` | Version required by SwapVM `release/1.1`. |
| OpenZeppelin contracts | tag `v5.4.0`, commit `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0` | Version declared by both contract dependencies. |
| forge-std | tag `v1.11.0`, commit `8e40513d678f392f398620b3ef2b418648b33e89` | Version declared by both contract dependencies. |
| Foundry | `1.5.1-stable`, commit `b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2` | Local and CI toolchain selection. |

All Solidity dependencies are Git submodules whose repository gitlinks pin full
immutable commit identifiers. Foundry remappings point only to those submodule
paths. The Aqua SDK remains an exact pnpm dependency recorded in
`pnpm-lock.yaml`.

The Aqua `main` commit reviewed during this audit was
`7a5972a6b562e3e622f6e6b2a0befef659cd5386`. Its contract core did not change
from tag `0.1.0`, but it is not selected because SwapVM explicitly declares the
tagged release.

## Compiler Contract

Both selected Solidity projects use exact `pragma solidity 0.8.30`. Liquid OB
therefore pins:

- Solidity `0.8.30`;
- Cancun EVM output;
- IR compilation enabled;
- optimizer enabled with 700 runs;
- SwapVM's exact Yul optimizer sequence.

The upstream source is imported and compiled without pragma edits, source
patches, or copied contract forks.

The unified workspace deliberately uses SwapVM's optimizer profile. It proves
source compatibility but is not intended to reproduce the deployed Aqua
bytecode, which may use a different upstream build profile. Deployment identity
is checked independently by the pinned Base fork.

Using source-only Git submodules is deliberate. Installing the published
Solidity packages through npm also installs unused Hardhat tooling and exposed
47 transitive JavaScript advisories during this audit. The Foundry build does
not require that tooling, so it is excluded rather than waived or hidden. After
the migration, `pnpm audit --prod` reports zero known vulnerabilities across
the remaining 23 production dependencies.

## License Boundary

Aqua uses `LicenseRef-Degensoft-Aqua-Source-1.1`; SwapVM uses
`LicenseRef-Degensoft-SwapVM-1.1`. Full texts and upstream third-party notices
are preserved in `LICENSES/`.

The smoke router and tests extend SwapVM, so they carry the SwapVM SPDX
identifier, attribution, and change date. The repository README carries the
required Aqua and SwapVM attribution. Independent Liquid OB protocol code has
not received a root license yet and must not be published under an assumed
license.

The licenses contain copyleft obligations for modifications and commercial-use
conditions. Those terms require a separate legal review before production or
commercial operation; passing this technical phase does not remove that gate.

## Official Base Evidence

The following state was verified at Base block `49,105,058`:

| Contract | Address | Code size | Code hash |
| --- | --- | ---: | --- |
| Aqua used by SwapVM | `0x499943e74fb0ce105688beee8ef2abec5d936d31` | 6,251 bytes | `0xced66b74e01f418c698e6aca8560d33957fb2588ea120eadbde74960f138baa2` |
| Aqua SwapVM router | `0x8fdd04dbf6111437b44bbca99c28882434e0958f` | 22,640 bytes | `0x998aac8c122ead4dac6aed42a7c4ef77c1d7db4efa6e2fda82978759117727e8` |

The deployed SwapVM `AQUA()` getter returns the Aqua address above.

The Aqua SDK `0.2.0` currently embeds a different address,
`0x1111113ccf1426a8e30e2bff5e005d929bf6a90a`, whose Base bytecode is also
different. Liquid OB must therefore inject the selected deployment address and
must not treat the SDK constant as authoritative for this SwapVM generation.

## Settlement Proof

`contracts/test/integration/AquaSwapVMSmoke.t.sol` runs the same assertions
against a local deployment of the pinned Aqua source and, when
`BASE_MAINNET_RPC_URL` is present, against the official Base Aqua deployment.
The test proves:

1. Maker approvals and `ship` produce the same strategy hash in Aqua and
   SwapVM.
2. SwapVM's static quote supports exact-input and exact-output queries without
   changing Aqua balances.
3. A custom 1:1 opcode executes exact-input and exact-output swaps through
   SwapVM.
4. Aqua `pull` transfers output directly from maker to taker.
5. Transfer-from plus Aqua `push` transfers input from taker to maker and
   updates virtual balances without Aqua custody.
6. A failed taker payment rolls back the earlier maker transfer and all Aqua
   accounting.
7. Maker `dock` zeroes both allocations, marks them docked, and makes safe
   balance reads revert.

Run the deterministic local proof with:

```bash
forge test --root contracts --force --match-contract AquaSwapVMLocalSmokeTest -vv
```

Run the official deployment proof with:

```bash
BASE_MAINNET_RPC_URL=<base-rpc> \
  forge test --root contracts --force --match-contract AquaSwapVMOfficialBaseForkTest -vv
```

Without the RPC variable, the fork suite is explicitly reported as skipped.

## Public Demo Environment

Base mainnet is the selected official-contract environment and a supported
indexing target. The hackathon deployment will use the official Aqua address,
a Liquid OB custom router, and valueless demo tokens only. No asset of value
may be used before the protocol-specific math, threat model, and audits are
complete.
