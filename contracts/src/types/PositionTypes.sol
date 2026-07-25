// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {AmountWad, CurveConfig, CurveQuote, CurveSide, CurveState} from "./CurveTypes.sol";

/// @notice Immutable two-sided policy embedded in one Liquid OB payload.
/// @param baseToken Canonical base ERC-20 address.
/// @param quoteToken Canonical quote ERC-20 address.
/// @param salt Maker-selected uniqueness value committed into the payload hash.
/// @param sell Maker side that releases base and receives quote.
/// @param buy Maker side that releases quote and receives base.
struct PositionConfig {
    address baseToken;
    address quoteToken;
    bytes32 salt;
    CurveConfig sell;
    CurveConfig buy;
}

/// @notice Mutable logical state keyed by maker and Aqua strategy hash.
/// @param sell Sell-side base reserve and domain scale, normalized to WAD.
/// @param buy Buy-side quote reserve and domain scale, normalized to WAD.
/// @param version Monotonic state version; zero is the immutable unmaterialized state.
/// @param initialized Whether the immutable initial state has been materialized in storage.
struct PositionRuntime {
    CurveState sell;
    CurveState buy;
    uint64 version;
    bool initialized;
}

/// @notice Full strategy locator required for Aqua and router reads.
/// @param maker Wallet that owns the Aqua strategy and its token balances.
/// @param strategyHash Keccak-256 of the exact ABI-encoded SwapVM order shipped to Aqua.
/// @param strategy Exact ABI-encoded SwapVM order bytes; not merely the Liquid OB payload.
struct PositionLocator {
    address maker;
    bytes32 strategyHash;
    bytes strategy;
}

/// @notice Parameters for a single-position exact-input or exact-output quote.
/// @param position Maker and exact immutable strategy bytes.
/// @param side Maker curve consumed by the taker.
/// @param expectedVersion Runtime version bound by the quote; zero selects immutable initial state.
/// @param amount Raw token units: input for exact input, output for exact output.
struct QuoteParams {
    PositionLocator position;
    CurveSide side;
    uint64 expectedVersion;
    uint256 amount;
}

/// @notice Product-level quote including both curve states before and after recycling.
/// @param marketId Domain-separated identifier for the ordered base/quote market.
/// @param positionKey Router runtime key derived from maker and strategy hash.
/// @param strategyHash Hash of the exact ABI-encoded SwapVM strategy.
/// @param curve Pure active-curve amounts, rates, prices, and active state.
/// @param beforeState Complete two-sided logical state before execution.
/// @param afterState Complete two-sided logical state after opposite-side credit.
struct PositionQuote {
    bytes32 marketId;
    bytes32 positionKey;
    bytes32 strategyHash;
    CurveQuote curve;
    PositionRuntime beforeState;
    PositionRuntime afterState;
}

/// @notice Aqua lifecycle classification returned by the Lens.
enum PositionLifecycle {
    Unknown,
    Active,
    Docked
}

/// @notice Reconciliation of one token backing a logical curve side.
/// @param token ERC-20 token address.
/// @param decimals ERC-20 native decimals used by raw amounts.
/// @param aquaAllocation Raw token units virtually allocated to the strategy in Aqua.
/// @param walletBalance Raw token units held by the maker wallet.
/// @param aquaAllowance Raw token units approved by the maker to Aqua.
/// @param logicalOutgoing Logical outgoing reserve normalized to WAD.
/// @param sufficientlyBacked Whether allocation, wallet balance, and allowance cover execution.
struct AssetBacking {
    address token;
    uint8 decimals;
    uint256 aquaAllocation;
    uint256 walletBalance;
    uint256 aquaAllowance;
    AmountWad logicalOutgoing;
    bool sufficientlyBacked;
}

/// @notice Complete Lens snapshot of immutable policy, runtime, and backing.
/// @param marketId Ordered base/quote market identifier.
/// @param positionKey Router runtime key.
/// @param positionId Portable identifier including chain, router, maker, and strategy hash.
/// @param strategyHash Exact Aqua strategy hash.
/// @param policyHash Keccak-256 of the canonical Liquid OB payload inside the program.
/// @param maker Aqua strategy owner.
/// @param encodingVersion Liquid OB payload version.
/// @param lifecycle Current Aqua lifecycle classification.
/// @param config Decoded immutable two-sided policy.
/// @param runtime Current logical two-sided state.
/// @param baseBacking Base-token allocation, wallet, allowance, and logical reserve.
/// @param quoteBacking Quote-token allocation, wallet, allowance, and logical reserve.
struct PositionSnapshot {
    bytes32 marketId;
    bytes32 positionKey;
    bytes32 positionId;
    bytes32 strategyHash;
    bytes32 policyHash;
    address maker;
    uint8 encodingVersion;
    PositionLifecycle lifecycle;
    PositionConfig config;
    PositionRuntime runtime;
    AssetBacking baseBacking;
    AssetBacking quoteBacking;
}
