// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {PositionLocator, PositionSnapshot} from "../types/PositionTypes.sol";

/// @notice Reconciles immutable policy, logical runtime, Aqua, wallet, and allowance state.
interface ILiquidOBLens {
    /// @notice Returns one complete position snapshot at the current block.
    function getPosition(PositionLocator calldata position) external view returns (PositionSnapshot memory snapshot);

    /// @notice Returns complete snapshots in the same order as the supplied locators.
    function getPositions(PositionLocator[] calldata positions)
        external
        view
        returns (PositionSnapshot[] memory snapshots);

    /// @notice Computes the ordered base/quote market identifier.
    function marketId(address baseToken, address quoteToken) external pure returns (bytes32);

    /// @notice Computes the router runtime key from maker and Aqua strategy hash.
    function positionKey(address maker, bytes32 strategyHash) external pure returns (bytes32);

    /// @notice Computes the portable chain/router/maker/strategy identifier.
    function positionId(uint256 chainId, address router, address maker, bytes32 strategyHash)
        external
        pure
        returns (bytes32);
}
