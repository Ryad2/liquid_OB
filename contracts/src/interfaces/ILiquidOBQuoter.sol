// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {PositionQuote, QuoteParams} from "../types/PositionTypes.sol";

/// @notice Read-only product quote surface for one specified maker position.
interface ILiquidOBQuoter {
    /// @notice Quotes a fixed raw incoming-token amount.
    function quoteExactInput(QuoteParams calldata params) external view returns (PositionQuote memory quote);

    /// @notice Quotes a fixed raw outgoing-token amount.
    function quoteExactOutput(QuoteParams calldata params) external view returns (PositionQuote memory quote);
}
