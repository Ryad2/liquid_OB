# Provenance

## Project baseline

- Repository: `Ryad2/liquid_OB`
- Initialized: 25 July 2026 during ETHGlobal Lisbon
- Initial remote state: empty, with no commits or branches
- Initial repository state: build, CI, documentation, and UI scaffolding

Any external starter, dependency, specification, or imported component must be
reviewed before use and added to the dependency register below with its source,
version, license, and purpose.

## Dependency register

| Component | Source | Version or commit | License | Purpose |
| --- | --- | --- | --- | --- |
| Foundry | https://github.com/foundry-rs/foundry | `1.5.1-stable` (`b0a9dd9ceda36f63e2326ce530c10e6916f4b8a2`) | Apache-2.0 or MIT | Solidity build and test tooling |
| Node.js | https://nodejs.org | 24.18.0 | MIT | JavaScript runtime |
| pnpm | https://pnpm.io | 10.32.1 | MIT | Workspace package manager |
| Python | https://www.python.org | 3.10+ | Python Software Foundation License | Development-only high-precision Decimal oracle and vector generator |
| Vite React template | https://github.com/vitejs/vite/tree/main/packages/create-vite | Vite 8.1.x | MIT | Initial web build configuration |
| React | https://github.com/facebook/react | 19.2.x | MIT | Web interface runtime |
| Oxlint | https://github.com/oxc-project/oxc | 1.71.x | MIT | TypeScript and React linting |
| Vitest | https://github.com/vitest-dev/vitest | lockfile-pinned | MIT | Web unit tests |
| Testing Library | https://github.com/testing-library/react-testing-library | lockfile-pinned | MIT | User-facing component assertions |
| Aqua contracts | https://github.com/1inch/aqua | `b51f3b6e3c02fa5208e1429f0f14706b025d9dd6` (`0.1.0`) | LicenseRef-Degensoft-Aqua-Source-1.1 | Shared-liquidity accounting and settlement |
| SwapVM contracts | https://github.com/1inch/swap-vm | `ac06e1bac021cd1983dc7c44d1f69b4b8861a945` (`release/1.1`) | LicenseRef-Degensoft-SwapVM-1.1 | Programmable quote and execution boundary |
| Aqua SDK | https://github.com/1inch/sdks/tree/master/typescript/aqua | package `0.2.0`; reviewed at `7172a94c0c8a77031ffef571b158a18c90fc21bb` | LicenseRef-Degensoft-Aqua-Source-1.1 | Later ship/dock encoding and event parsing |
| 1inch Solidity utilities | https://github.com/1inch/solidity-utils | `29043f22422fde454951e9733129cce5d67e6a39` (`6.9.7`) | MIT | Token transfer and low-level Solidity utilities required by Aqua/SwapVM |
| OpenZeppelin Contracts | https://github.com/OpenZeppelin/openzeppelin-contracts | `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0` (`v5.4.0`) | MIT | ERC-20, ownership, cryptography, and math dependencies |
| forge-std | https://github.com/foundry-rs/forge-std | `8e40513d678f392f398620b3ef2b418648b33e89` (`v1.11.0`) | MIT or Apache-2.0 | Solidity test framework |
| Solady | https://github.com/Vectorized/solady | `acd959aa4bd04720d640bf4e6a5c71037510cc4b` (`v0.1.26`) | MIT | Pinned monotone fixed-point `lnWad` and `expWad` approximation backend |

The full compatibility, deployment-address, compiler, and license analysis is
recorded in [`DEPENDENCY_AUDIT.md`](DEPENDENCY_AUDIT.md).

The selection, rejected alternatives, numerical wrapper, and approximation
boundary for Solady are recorded separately in
[`TRANSCENDENTAL_MATH_AUDIT.md`](TRANSCENDENTAL_MATH_AUDIT.md).
