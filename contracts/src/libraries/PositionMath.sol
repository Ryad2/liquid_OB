// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {AmountWad, CurveQuote, CurveSide, CurveState, Rounding} from "../types/CurveTypes.sol";
import {PositionConfig, PositionRuntime} from "../types/PositionTypes.sol";
import {FullPrecisionMath} from "./FullPrecisionMath.sol";

/// @notice Applies one directional fill and recycles its incoming asset into the opposite curve.
library PositionMath {
    function initial(PositionConfig memory config) internal pure returns (PositionRuntime memory runtime) {
        runtime.sell = _freshState(config.sell.initialReserve);
        runtime.buy = _freshState(config.buy.initialReserve);
    }

    function resolve(PositionConfig memory config, PositionRuntime memory stored)
        internal
        pure
        returns (PositionRuntime memory runtime)
    {
        return stored.initialized ? stored : initial(config);
    }

    function transition(PositionRuntime memory beforeState, CurveSide activeSide, CurveQuote memory curveQuote)
        internal
        pure
        returns (PositionRuntime memory afterState)
    {
        afterState = beforeState;

        if (activeSide == CurveSide.Sell) {
            afterState.sell = curveQuote.activeAfter;
            afterState.buy = _credit(afterState.buy, curveQuote.amountInWad);
        } else {
            afterState.buy = curveQuote.activeAfter;
            afterState.sell = _credit(afterState.sell, curveQuote.amountInWad);
        }

        afterState.version = beforeState.version + 1;
        afterState.initialized = true;
    }

    function _freshState(AmountWad reserve) private pure returns (CurveState memory) {
        return CurveState({y: reserve, yInt: reserve});
    }

    /// @dev Scaling both values by the same factor preserves progress and therefore marginal price.
    function _credit(CurveState memory state, AmountWad received) private pure returns (CurveState memory credited) {
        uint256 amount = AmountWad.unwrap(received);
        if (amount == 0) return state;

        uint256 yBefore = AmountWad.unwrap(state.y);
        if (yBefore == 0) {
            AmountWad fresh = FullPrecisionMath.toAmountWad(amount);
            return CurveState({y: fresh, yInt: fresh});
        }

        uint256 yAfter = yBefore + amount;
        uint256 yIntAfter = FullPrecisionMath.mulDiv(AmountWad.unwrap(state.yInt), yAfter, yBefore, Rounding.Up);
        credited =
            CurveState({y: FullPrecisionMath.toAmountWad(yAfter), yInt: FullPrecisionMath.toAmountWad(yIntAfter)});
    }
}
