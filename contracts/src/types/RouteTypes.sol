// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {CurveSide} from "./CurveTypes.sol";

/// @notice One solver-selected position fill in an ordered atomic route.
/// @param maker Aqua strategy owner.
/// @param strategyHash Keccak-256 of the exact ABI-encoded SwapVM strategy.
/// @param expectedVersion Runtime version that must still match onchain.
/// @param amount Raw token units: per-fill input for exact input, output for exact output.
/// @param strategy Exact ABI-encoded SwapVM order bytes passed to the custom router.
struct FillRequest {
    address maker;
    bytes32 strategyHash;
    uint64 expectedVersion;
    uint256 amount;
    bytes strategy;
}

/// @notice Atomic route that fixes aggregate incoming amount.
/// @param baseToken Canonical base ERC-20 address for every fill.
/// @param quoteToken Canonical quote ERC-20 address for every fill.
/// @param side Maker side consumed by every fill, determining token direction.
/// @param salt Caller-selected uniqueness value used in the route identifier.
/// @param amountIn Exact aggregate raw incoming-token units.
/// @param minAmountOut Minimum aggregate raw outgoing-token units.
/// @param recipient Receiver of outgoing tokens.
/// @param refundRecipient Receiver of any unallocated incoming-token remainder.
/// @param deadline Inclusive Unix timestamp after which execution reverts.
/// @param fills Ordered bounded fill proposal; each amount is raw input units.
struct ExactInputRoute {
    address baseToken;
    address quoteToken;
    CurveSide side;
    bytes32 salt;
    uint256 amountIn;
    uint256 minAmountOut;
    address recipient;
    address refundRecipient;
    uint40 deadline;
    FillRequest[] fills;
}

/// @notice Atomic route that fixes aggregate outgoing amount.
/// @param baseToken Canonical base ERC-20 address for every fill.
/// @param quoteToken Canonical quote ERC-20 address for every fill.
/// @param side Maker side consumed by every fill, determining token direction.
/// @param salt Caller-selected uniqueness value used in the route identifier.
/// @param amountOut Exact aggregate raw outgoing-token units.
/// @param maxAmountIn Maximum aggregate raw incoming-token units.
/// @param recipient Receiver of outgoing tokens.
/// @param refundRecipient Receiver of unused incoming tokens.
/// @param deadline Inclusive Unix timestamp after which execution reverts.
/// @param fills Ordered bounded fill proposal; each amount is raw output units.
struct ExactOutputRoute {
    address baseToken;
    address quoteToken;
    CurveSide side;
    bytes32 salt;
    uint256 amountOut;
    uint256 maxAmountIn;
    address recipient;
    address refundRecipient;
    uint40 deadline;
    FillRequest[] fills;
}

/// @notice Aggregate result of one successfully settled route.
/// @param routeId Domain-separated identifier emitted by the executor.
/// @param amountIn Actual aggregate raw incoming-token units.
/// @param amountOut Actual aggregate raw outgoing-token units.
/// @param fillCount Number of ordered fills executed atomically.
struct RouteResult {
    bytes32 routeId;
    uint256 amountIn;
    uint256 amountOut;
    uint16 fillCount;
}
