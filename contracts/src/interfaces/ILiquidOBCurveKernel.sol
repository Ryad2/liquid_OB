// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {CurveBranch, CurveConfig, CurveSide, QuoteKind} from "../types/CurveTypes.sol";
import {PositionConfig, PositionQuote, PositionRuntime} from "../types/PositionTypes.sol";

/// @notice Stateless codec and quote kernel used by the size-bounded SwapVM router.
interface ILiquidOBCurveKernel {
    function deriveCurve(CurveConfig calldata config, CurveSide side) external pure returns (CurveConfig memory);

    function encodePosition(PositionConfig calldata config) external pure returns (bytes memory);

    function decodePosition(bytes calldata payload) external pure returns (PositionConfig memory);

    function resolveRuntime(PositionConfig calldata config, PositionRuntime calldata storedRuntime)
        external
        pure
        returns (PositionRuntime memory);

    function quotePosition(
        PositionConfig calldata config,
        PositionRuntime calldata storedRuntime,
        address maker,
        bytes32 strategyHash,
        CurveSide side,
        uint64 expectedVersion,
        QuoteKind kind,
        uint256 rawAmount,
        uint256 outputBalanceRaw
    ) external view returns (PositionQuote memory positionQuote, CurveBranch branch);
}
