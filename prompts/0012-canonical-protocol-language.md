# Prompt 0012: Canonical Protocol Language

Date: 25 July 2026

## Request

Continue implementation with the next dependency-ordered protocol phase after
the Aqua/SwapVM integration proof and ETHGlobal rules audit.

## Required Output

- Freeze price, native-rate, amount, alpha, and dimensionless units.
- Freeze maker direction, special branches, runtime versions, and rounding.
- Define position, quote, backing, fill, and exact-input/output route structs.
- Define canonical errors and reconstructable Subgraph event fields.
- Define Quoter, Lens, and bounded batch executor interfaces.
- Implement a compact versioned payload with structural validation.
- Distinguish policy payload, SwapVM program, and full Aqua strategy hashes.
- Add deterministic round-trip, hash, branch, identifier, and rejection tests.
- Do not implement curve arithmetic, token settlement, or routing yet.

## Decision

Version 1 is a fixed 269-byte compact payload. It stores ordered tokens, salt,
displayed endpoints and alpha, initial normalized reserves, and native `mu` and
`kappa` commitments for both sides. Structural decoding is separate from
future mathematical validation. Exact formulas, offsets, event contracts, and
the committed reference vector are normative in `docs/WIRE_FORMAT.md`.
