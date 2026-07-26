// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import {ILiquidOBQuoter} from "../interfaces/ILiquidOBQuoter.sol";
import {PositionQuote, QuoteParams} from "../types/PositionTypes.sol";
import {LiquidOBMakerMismatch, LiquidOBStrategyHashMismatch, LiquidOBZeroAddress} from "../types/ProtocolErrors.sol";
import {PositionCodec} from "../libraries/PositionCodec.sol";
import {LiquidOBSwapVMRouter} from "../core/LiquidOBSwapVMRouter.sol";

/// @notice Product-facing view wrapper around the executable SwapVM curve path.
contract LiquidOBQuoter is ILiquidOBQuoter {
    LiquidOBSwapVMRouter public immutable ROUTER;

    constructor(address router) {
        if (router == address(0)) revert LiquidOBZeroAddress();
        ROUTER = LiquidOBSwapVMRouter(payable(router));
    }

    function quoteExactInput(QuoteParams calldata params) external view returns (PositionQuote memory quote) {
        ISwapVM.Order memory order = _validatedOrder(params);
        return ROUTER.previewExactInput(order, params.side, params.expectedVersion, params.amount);
    }

    function quoteExactOutput(QuoteParams calldata params) external view returns (PositionQuote memory quote) {
        ISwapVM.Order memory order = _validatedOrder(params);
        return ROUTER.previewExactOutput(order, params.side, params.expectedVersion, params.amount);
    }

    function _validatedOrder(QuoteParams calldata params) private pure returns (ISwapVM.Order memory order) {
        order = abi.decode(params.position.strategy, (ISwapVM.Order));
        if (order.maker != params.position.maker) {
            revert LiquidOBMakerMismatch(params.position.maker, order.maker);
        }

        bytes32 computed = PositionCodec.hashStrategy(params.position.strategy);
        if (computed != params.position.strategyHash) {
            revert LiquidOBStrategyHashMismatch(params.position.strategyHash, computed);
        }
    }
}
