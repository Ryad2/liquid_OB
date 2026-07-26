// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {ILiquidOBEvents} from "./ILiquidOBEvents.sol";
import {ExactInputRoute, ExactOutputRoute, RouteResult} from "../types/RouteTypes.sol";

/// @notice Bounded atomic execution surface for solver-proposed multi-maker routes.
interface ILiquidOBBatchExecutor is ILiquidOBEvents {
    /// @notice Executes a route with fixed aggregate raw input and minimum raw output.
    function executeExactInput(ExactInputRoute calldata route) external returns (RouteResult memory result);

    /// @notice Executes a route with fixed aggregate raw output and maximum raw input.
    function executeExactOutput(ExactOutputRoute calldata route) external returns (RouteResult memory result);
}
