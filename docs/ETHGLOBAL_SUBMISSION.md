# ETHGlobal Submission Copy

## Project name

ArcBook

## Category

DeFi

## Emoji

〰️

## Demonstration

https://arcbook-nu.vercel.app

## Short description

An onchain order book where makers publish executable curves instead of fixed-price orders.

## Description

Traditional order books force market makers to split liquidity across many
independent price-and-size levels, while conventional AMMs place everyone
inside a shared pool curve. ArcBook introduces a functional order book in which
every maker position is itself a bounded, executable pricing curve.

A maker independently configures buy and sell inventory, starting and ending
prices, and an alpha parameter that continuously shapes how liquidity is
distributed through the range. Equal endpoint prices reduce to an ordinary
fixed-price limit order, so the classical order book is a special case. As one
side executes, the assets received are automatically recycled into the
opposite side while preserving its current marginal price. Makers therefore
express an entire execution policy with one position instead of continuously
cancelling and replacing a ladder of orders.

ArcBook indexes every active position, reconstructs its live marginal state,
and lets a deterministic solver split exact-input or exact-output trades across
multiple makers. The selected fills settle atomically on Base Sepolia, so a
route either completes within its aggregate limit or fully reverts. The live
application supports publishing positions, visualizing their shapes, obtaining
quotes, executing multi-maker routes, following activity, and docking
liquidity.

## How it is made

ArcBook is a TypeScript and Solidity monorepo. The onchain system is written in
Solidity 0.8.30 and tested with Foundry. A fixed-point curve kernel compiles the
maker-facing start price, end price, alpha, and reserve into direction-normalized
SwapVM state. It implements the general power branch, the exact alpha-zero
geometric limit, other singular analytical paths, and the equal-price flat-order
extension. A custom SwapVM instruction executes exact-input and exact-output
fills, updates runtime state, and atomically credits incoming inventory to the
position's opposite curve without moving that curve's marginal price.

We use the official 1inch Aqua contracts as the shared-liquidity and settlement
layer. Makers publish immutable encoded strategies with `Aqua.ship`; assets
remain under maker ownership and Aqua allowances settle fills when the ArcBook
router executes them. SwapVM provides the programmable execution environment,
which let us add the curve instruction instead of building a separate custody
vault or hard-coding one pool invariant.

A native The Graph Subgraph indexes position publication, curve sides, runtime
updates, fills, atomic routes, markets, makers, and lifecycle events. The
stateless solver API pins all related GraphQL reads to one indexed block, checks
freshness against Base Sepolia, refreshes executable state through the Lens and
Quoter contracts, ranks the available curves, and returns bounded multi-fill
calldata for the BatchExecutor. We also expose this indexed executable
liquidity through a public MCP server with tools for position discovery,
ArcBook quoting, simulated candidate-route construction, and liquidity
comparison.

The product UI uses React, Vite, TypeScript, and viem. It validates an immutable
deployment manifest, fails closed if live services disagree, and drives ordered
wallet flows for approvals, publishing, execution, and docking. Vercel hosts
the frontend, solver API, and MCP endpoints; The Graph hosts the live Subgraph;
all contracts and demo assets are deployed on Base Sepolia. The repository also
contains Vitest coverage, Foundry unit/integration/security/fuzz tests, a
high-precision independent Python reference model, generated ABIs, deployment
scripts, and a public zero-localhost release verifier.

## Repository

https://github.com/Ryad2/liquid_OB

Repository type: Primary monorepo.

## Languages

- Node.js
- JavaScript
- TypeScript
- Solidity
- Python, if offered by the form
- HTML and CSS, if offered by the form

## Web frameworks

- React
- Vite
- Fastify

Do not select Next.js or Express: ArcBook does not use them.

## Databases

Select `None` or `Not applicable`. ArcBook reads indexed blockchain state from
The Graph, but it does not operate a conventional application database such as
PostgreSQL, Supabase, MongoDB, or Firebase.

## Design tools

Select `None` unless a design tool was actually used outside this repository.

## Other technologies

Enter these as separate values where the form supports them:

- 1inch Aqua
- 1inch SwapVM
- The Graph
- GraphQL
- Foundry
- viem
- Base Sepolia
- Vercel
- Vitest
- Model Context Protocol (MCP)
- pnpm
- Zod

## AI usage

OpenAI Codex/ChatGPT and Claude Code were used as pair-programming assistants
across architecture exploration, Solidity and TypeScript implementation,
frontend integration, test generation, debugging, and documentation. The
resulting protocol behavior was validated with an independent high-precision
Python reference model, Foundry unit, integration, security, and fuzz tests,
Vitest suites, and live Base Sepolia release checks. AI is not part of ArcBook's
runtime, pricing, routing, or settlement decisions.

## Sponsor prize fields

### The Graph

**How are you using this Protocol / API?**

ArcBook uses a live native Subgraph as the load-bearing discovery layer for
every maker curve, allocation, runtime update, fill, and route; the solver
rejects stale or erroring snapshots before preparing executable calldata. On
top of it, we ship a public reusable Executable Liquidity MCP for AI clients to
discover positions, quote and simulate multi-maker routes, and compare
Graph-backed liquidity, making ArcBook applicable to Best AI Tooling for The
Graph.

**Primary code link**

https://github.com/Ryad2/liquid_OB/blob/26db6f7852ae6cc7fc1be7d3f12353d4b153a123/services/solver-api/src/graph-client.ts#L14-L37

**Ease score:** 8/10

**Additional feedback**

Graph CLI, code generation, and Subgraph Studio made it fast to move from a
schema to a live endpoint, and `_meta` block provenance is especially valuable
for a trading solver. The main friction is keeping pagination coherent while
the indexed head moves and finding production-oriented Subgraph-to-MCP and
standardized-schema examples; clearer snapshot-pinned pagination guidance and
an end-to-end MCP template would make this workflow easier.

### Uniswap Foundation

**How are you using this Protocol / API?**

ArcBook is a new onchain market primitive built from scratch: makers publish
bounded executable equations instead of fixed-price orders, and a deterministic
solver composes them into atomic multi-maker routes. Submission note: ArcBook /
Ryad; the Uniswap sponsor team confirmed in writing that this project may apply
to the scratch bounty without forcing an artificial Uniswap API call.

**Primary code link**

https://github.com/Ryad2/liquid_OB/blob/26db6f7852ae6cc7fc1be7d3f12353d4b153a123/contracts/src/core/LiquidOBCurveKernel.sol#L53-L115

**Ease score:** 8/10

**Additional feedback**

The API documentation was clear and sponsor support was responsive. Because
this submission follows a written no-API exception, this score reflects the
documentation and onboarding experience rather than a runtime integration. The
main ambiguity was that the public bounty text described API use as mandatory
but offered no place to record an approved from-scratch primitive exception;
adding that path and clarifying the expected feedback for exception projects
would prevent confusion.

Uniswap feedback document:
https://github.com/Ryad2/liquid_OB/blob/26db6f7852ae6cc7fc1be7d3f12353d4b153a123/FEEDBACK.md

### 1inch

**How are you using this Protocol / API?**

ArcBook is a custom Aqua app implementing sophisticated two-sided,
self-recycling maker positions. It extends the official AquaSwapVMRouter with a
purpose-built SwapVM curve instruction, keeps maker balances in Aqua, and
settles exact-input and exact-output multi-maker routes onchain on Base Sepolia.

**Primary code link**

https://github.com/Ryad2/liquid_OB/blob/26db6f7852ae6cc7fc1be7d3f12353d4b153a123/contracts/src/core/LiquidOBSwapVMRouter.sol#L8-L25

**Ease score:** 8/10

**Additional feedback**

Aqua's self-custodial shared balances and SwapVM's custom-instruction model were
an excellent fit: we could implement a new position type without building a
separate custody vault. The largest integration cost was assembling a complete
custom-opcode app across order encoding, maker allowances, the Aqua ship/dock
lifecycle, frontend signatures, and EIP-170 bytecode limits; an official
minimal reference app covering those pieces and current testnet deployment
guidance would materially shorten onboarding.

### Other partner technologies

Select Base only if it appears in the partner list, because the complete public
demo is deployed on Base Sepolia. Do not select World, Sui, Hedera, 0G, ENS, or
any other partner technology that ArcBook does not actually use.

### Open-source qualification warning

The Graph and Uniswap qualification text requires open-source code. The current
repository is public but deliberately has no root open-source license, so this
requirement is not safely satisfied merely by source visibility. Select and add
a root license before submission, or obtain written sponsor confirmation that
the current source-available status qualifies.
