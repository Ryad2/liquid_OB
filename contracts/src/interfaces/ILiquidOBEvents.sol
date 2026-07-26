// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {CurveBranch, CurveSide, QuoteKind} from "../types/CurveTypes.sol";

/// @notice Canonical events consumed by the Liquid OB Subgraph.
interface ILiquidOBEvents {
    /// @notice Emitted when immutable initial state is first materialized in router storage.
    event PositionRuntimeInitialized(
        bytes32 indexed positionKey,
        bytes32 indexed marketId,
        address indexed maker,
        bytes32 strategyHash,
        uint128 sellY,
        uint128 sellYInt,
        uint128 buyY,
        uint128 buyYInt,
        uint64 version
    );

    /// @notice Emitted once per successful position fill with reconstructable two-sided state.
    event CurveFilled(
        bytes32 indexed routeId,
        bytes32 indexed positionKey,
        address indexed maker,
        bytes32 marketId,
        bytes32 strategyHash,
        uint16 fillIndex,
        CurveSide side,
        CurveBranch branch,
        QuoteKind kind,
        address payer,
        address recipient,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint128 nativeRateBeforeWad,
        uint128 nativeRateAfterWad,
        uint128 nativeEffectiveRateWad,
        uint128 displayedPriceBeforeWad,
        uint128 displayedPriceAfterWad,
        uint128 displayedEffectivePriceWad,
        uint128 sellYBeforeWad,
        uint128 sellYIntBeforeWad,
        uint128 buyYBeforeWad,
        uint128 buyYIntBeforeWad,
        uint64 versionBefore,
        uint128 sellYAfterWad,
        uint128 sellYIntAfterWad,
        uint128 buyYAfterWad,
        uint128 buyYIntAfterWad,
        uint64 versionAfter
    );

    /// @notice Emitted after every fill in an atomic route has settled successfully.
    event RouteExecuted(
        bytes32 indexed routeId,
        bytes32 indexed marketId,
        address indexed payer,
        address recipient,
        address refundRecipient,
        CurveSide side,
        QuoteKind kind,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 limit,
        uint16 fillCount
    );
}
