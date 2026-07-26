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
