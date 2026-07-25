# Liquid OB Canonical ABI And Wire Format

Status: normative version 1 contract for Solidity, TypeScript, The Graph, and
deployment tooling. Mathematical formulas remain normative in `MATH_SPEC.md`.

## 1. Units

Liquid OB deliberately distinguishes raw ERC-20 transfer amounts from values
used by curve mathematics.

| Type | Solidity representation | Scale | Meaning |
| --- | --- | --- | --- |
| Raw token amount | `uint256` | token-native decimals | Amount transferred, approved, allocated in Aqua, or compared to route limits |
| `AmountWad` | `uint128` | `1e18` | Token amount normalized to 18 decimals for curve state and math |
| `PriceWad` | `uint128` | `1e18` | Displayed quote-token units per one base-token unit |
| `RateWad` | `uint128` | `1e18` | Native outgoing-token units per incoming-token unit |
| `UnitlessWad` | `uint128` | `1e18` | Dimensionless range or ratio value such as `mu` |
| `AlphaWad` | `int128` | `1e18` | Signed maker-facing Holder parameter |

The WAD constant is exactly `1_000_000_000_000_000_000`. The MVP supports
standard ERC-20 tokens with at most 18 decimals. For that domain, converting a
raw amount into WAD is multiplication and therefore exact. Conversion from WAD
back into fewer token decimals may require directional rounding.

`AlphaWad` uses the symmetric raw interval:

```text
[-170141183460469231731687303715884105727,
  170141183460469231731687303715884105727]
```

The unmatched `int128.min` value is rejected because sell compilation negates
maker-facing alpha. This storage interval is not a promise that every value is
numerically safe. `CurveCompiler` and the math kernel apply rate-dependent
power, logarithm, exponential, and overflow domains without imposing a
semantic alpha allowlist.

## 2. Direction

`CurveSide` is maker-facing:

| Side | Maker releases | Taker supplies | Taker receives | Native rate |
| --- | --- | --- | --- | --- |
| `Sell = 0` | base | quote | base | base output per quote input |
| `Buy = 1` | quote | base | quote | quote output per base input |

Displayed price is always quote per base. Buy curves preserve displayed alpha
and rates during compilation. Sell curves reciprocate endpoints and negate
displayed alpha. Consequently, displayed sell `alpha = -1` is the exact native
`alpha = 1` branch.

`QuoteKind` is fixed as `ExactInput = 0` and `ExactOutput = 1`.
`CurveBranch` is fixed as `General = 0`, `NativeAlphaZero = 1`,
`NativeAlphaOne = 2`, and `Flat = 3`. Branch is derived and is not encoded as
an independently selectable mode.

## 3. Three Byte Layers

The protocol must not use the words payload, program, and strategy
interchangeably:

1. **Liquid OB payload**: the 269-byte policy encoded by `PositionCodec`.
2. **SwapVM program**: the custom Liquid OB opcode plus the payload and any
   required VM terminator or control instructions.
3. **Aqua strategy bytes**: `abi.encode(ISwapVM.Order)` containing maker,
   traits, hooks, and the complete SwapVM program.

The identifiers are correspondingly distinct:

```text
policyHash   = keccak256(liquidOBPayload)
strategyHash = keccak256(abi.encode(swapVMOrder))
```

Aqua commits `strategyHash`. Router runtime is keyed by maker and
`strategyHash`. `policyHash` is an audit and SDK identity and cannot substitute
for the Aqua strategy hash.

## 4. Payload Version 1

All integer fields use packed ABI big-endian bytes. Signed alpha uses 128-bit
two's-complement representation. The payload has no dynamic field and must be
exactly 269 bytes.

| Start offset | End offset | Bytes | Field | Type |
| ---: | ---: | ---: | --- | --- |
| 0 | 3 | 4 | Magic `LOB1` | `bytes4` = `0x4c4f4231` |
| 4 | 4 | 1 | Encoding version | `uint8` = `1` |
| 5 | 24 | 20 | Base token | `address` |
| 25 | 44 | 20 | Quote token | `address` |
| 45 | 76 | 32 | Maker salt | `bytes32` |
| 77 | 92 | 16 | Sell start price | `uint128 PriceWad` |
| 93 | 108 | 16 | Sell end price | `uint128 PriceWad` |
| 109 | 124 | 16 | Sell displayed alpha | `int128 AlphaWad` |
| 125 | 140 | 16 | Sell initial base reserve | `uint128 AmountWad` |
| 141 | 156 | 16 | Sell native `mu` | `uint128 UnitlessWad` |
| 157 | 172 | 16 | Sell native `kappa` | `uint128 RateWad` |
| 173 | 188 | 16 | Buy start price | `uint128 PriceWad` |
| 189 | 204 | 16 | Buy end price | `uint128 PriceWad` |
| 205 | 220 | 16 | Buy displayed alpha | `int128 AlphaWad` |
| 221 | 236 | 16 | Buy initial quote reserve | `uint128 AmountWad` |
| 237 | 252 | 16 | Buy native `mu` | `uint128 UnitlessWad` |
| 253 | 268 | 16 | Buy native `kappa` | `uint128 RateWad` |

The initial state is fresh-boundary state:

```text
y = yInt = initialReserve
```

One side may start empty and retain immutable parameters for later rearming.
Both sides may not start empty.

## 5. Canonicality

`PositionCodec.validateStructure` rejects:

- a zero token address or identical base and quote tokens;
- a zero displayed endpoint price;
- sell `startPrice > endPrice` or buy `startPrice < endPrice`;
- `int128.min` alpha;
- a non-flat side with zero `mu` or zero `kappa`;
- a flat side whose alpha is nonzero, `mu` is nonzero, or `kappa` is zero;
- two initially empty sides; and
- wrong magic, version, or payload length during decoding.

Equal endpoints are canonical flat orders. Their alpha and `mu` are zero,
while `kappa` stores the compiled native flat output/input rate. This removes
economically irrelevant alpha values from flat-order hashes.

Structural validation does not prove that non-flat `mu` and `kappa` were
correctly compiled from endpoints and alpha. Phase 4 `CurveCompiler` must emit
those commitments, and every execution path must reject inconsistent or
numerically unsafe commitments. Decoding bytes is never sufficient execution
authorization.

## 6. Identifiers

Identifiers use standard ABI encoding with explicit type domains:

```text
MARKET_TYPEHASH = keccak256(
  "LiquidOBMarket(address baseToken,address quoteToken)"
)

marketId = keccak256(
  abi.encode(MARKET_TYPEHASH, baseToken, quoteToken)
)
```

Base and quote order is semantic. Reversing the two addresses produces a
different market.

```text
POSITION_KEY_TYPEHASH = keccak256(
  "LiquidOBPositionKey(address maker,bytes32 strategyHash)"
)

positionKey = keccak256(
  abi.encode(POSITION_KEY_TYPEHASH, maker, strategyHash)
)
```

`positionKey` is the router runtime key.

```text
POSITION_ID_TYPEHASH = keccak256(
  "LiquidOBPositionId(uint256 chainId,address router,address maker,bytes32 strategyHash)"
)

positionId = keccak256(
  abi.encode(POSITION_ID_TYPEHASH, chainId, router, maker, strategyHash)
)
```

`positionId` is the portable UI, Subgraph, and analytics identifier.

## 7. Runtime And Versions

Router runtime is exactly:

```text
sell.y, sell.yInt
buy.y,  buy.yInt
version
initialized
```

All four curve amounts are `AmountWad`. Version is `uint64`. Version zero
means the immutable initial state has not yet been materialized. The first
successful fill materializes state and advances the version; every later
successful fill increments it once. A quote and every `FillRequest` bind an
`expectedVersion` and stale versions revert.

## 8. Route ABI

One `FillRequest.amount` has route-dependent raw-token semantics:

- exact-input route: raw per-fill incoming-token amount;
- exact-output route: raw per-fill outgoing-token amount.

Every route declares semantic base, quote, active maker side, recipient,
refund recipient, inclusive `uint40` deadline, salt, aggregate amount and
aggregate slippage limit. Every fill includes exact strategy bytes, maker,
strategy hash, and expected runtime version. The executor later enforces a hard
fill-count bound and one occurrence per position key.

## 9. Rounding Contract

The public amount contract is maker-favorable and identical in quote and
execution:

- required raw input rounds up;
- delivered raw output rounds down;
- exact-input `amountIn` and exact-output `amountOut` are caller-fixed and are
  never silently changed;
- `minAmountOut` and `maxAmountIn` compare actual raw transferred amounts;
- WAD-to-raw conversion rounds up for required input and down for delivered
  output;
- native output/input rates are reported down as executable lower bounds;
- displayed buy quote/base prices follow the native lower bound;
- displayed sell quote/base prices are reciprocal input/output values and
  round up; and
- runtime mutation uses amounts corresponding to the actual rounded transfers,
  never unrounded ideal real values.

The future arithmetic modules must name `Rounding.Up` or `Rounding.Down` at
every division and conversion. Nearest rounding is not a settlement rule.

## 10. Indexed Event Contract

Lifecycle publication and cancellation remain authoritative in Aqua:

- Aqua `Shipped` supplies maker, app, exact strategy bytes, tokens, amounts,
  and strategy hash;
- Aqua `Docked`, `Pushed`, and `Pulled` supply lifecycle and allocation changes.

Liquid OB adds only events it can authoritatively emit:

- `PositionRuntimeInitialized` materializes immutable initial state;
- `CurveFilled` supplies route linkage, direction, branch, amounts, native and
  displayed rates, and all four pre/post runtime fields; and
- `RouteExecuted` supplies aggregate limits and amounts for the atomic route.

The Subgraph can reconstruct both sides after every fill without transaction-
input scraping. Conceptual `PositionPublished`, `PositionCancelled`,
`CurveAdvanced`, `OppositeCurveRescaled`, and `FlatOrderFilled` entities or
labels are derived from these canonical Aqua and Liquid OB events; redundant
onchain events are not required.

## 11. Deterministic Version 1 Vector

The committed test vector uses:

```text
base  = 0x1111111111111111111111111111111111111111
quote = 0x2222222222222222222222222222222222222222
salt  = keccak256("liquid-ob-phase-2-vector")

sell = (100e18, 200e18, 2e18, 5e18, 0.75e18, 0.01e18)
buy  = (99e18, 50e18, -1e18, 5000e18, 0.5e18, 50e18)
```

Its exact payload is:

```text
0x4c4f42310111111111111111111111111111111111111111112222222222222222222222222222222222222222366b28be9ac9d919f41cd308ad50b8c74923994bfa163d87f28b5a6e6603108800000000000000056bc75e2d63100000000000000000000ad78ebc5ac620000000000000000000001bc16d674ec8000000000000000000004563918244f4000000000000000000000a688906bd8b00000000000000000000002386f26fc1000000000000000000055de6a779bbac00000000000000000002b5e3af16b1880000fffffffffffffffff21f494c589c0000000000000000010f0cf064dd59200000000000000000000006f05b59d3b200000000000000000002b5e3af16b1880000
```

Length and hash are fixed:

```text
length     = 269
policyHash = 0x545e5548b93c30a5c4aeefdd59d90941e754c725f5a8df1f212265055fe6ab07
```

Any change to an offset, width, endian rule, canonicalization rule, or field
order requires a new encoding version and migration plan rather than silently
changing version 1.
