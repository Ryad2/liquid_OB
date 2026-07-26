// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {AmountWad, Rounding} from "../types/CurveTypes.sol";
import {
    LiquidOBAmountOverflow,
    LiquidOBMathDivisionByZero,
    LiquidOBMathOverflow,
    LiquidOBMathUnderflow,
    LiquidOBNegativeToUnsigned,
    LiquidOBUnsupportedTokenDecimals
} from "../types/ProtocolErrors.sol";

/// @notice Checked fixed-point arithmetic shared by the Liquid OB kernel.
/// @dev `Rounding.Down` is mathematical floor and `Rounding.Up` is mathematical
///      ceiling. This distinction matters for negative signed results.
library FullPrecisionMath {
    uint256 internal constant WAD = 1e18;
    int256 internal constant WAD_INT = 1e18;
    uint8 internal constant MAX_TOKEN_DECIMALS = 18;

    /// @notice Computes `x * y / denominator` without losing the high 256 product bits.
    function mulDiv(uint256 x, uint256 y, uint256 denominator, Rounding rounding)
        internal
        pure
        returns (uint256 result)
    {
        if (denominator == 0) revert LiquidOBMathDivisionByZero();

        (uint256 high,) = Math.mul512(x, y);
        if (high >= denominator) revert LiquidOBMathOverflow();

        result = Math.mulDiv(x, y, denominator);
        if (rounding == Rounding.Up && mulmod(x, y, denominator) != 0) {
            if (result == type(uint256).max) revert LiquidOBMathOverflow();
            unchecked {
                ++result;
            }
        }
    }

    /// @notice Divides unsigned integers with an explicit floor or ceiling.
    function div(uint256 numerator, uint256 denominator, Rounding rounding) internal pure returns (uint256) {
        return mulDiv(numerator, 1, denominator, rounding);
    }

    /// @notice Multiplies two unsigned WAD values and returns a WAD value.
    function mulWad(uint256 xWad, uint256 yWad, Rounding rounding) internal pure returns (uint256) {
        return mulDiv(xWad, yWad, WAD, rounding);
    }

    /// @notice Divides two unsigned WAD values and returns a WAD value.
    function divWad(uint256 xWad, uint256 yWad, Rounding rounding) internal pure returns (uint256) {
        return mulDiv(xWad, WAD, yWad, rounding);
    }

    /// @notice Returns `1 / valueWad` as WAD.
    function reciprocalWad(uint256 valueWad, Rounding rounding) internal pure returns (uint256) {
        return mulDiv(WAD, WAD, valueWad, rounding);
    }

    /// @notice Computes signed `x * y / denominator` using floor or ceiling semantics.
    function mulDivSigned(int256 x, int256 y, int256 denominator, Rounding rounding) internal pure returns (int256) {
        if (denominator == 0) revert LiquidOBMathDivisionByZero();

        bool negative = (x < 0) != (y < 0) != (denominator < 0);
        uint256 xMagnitude = abs(x);
        uint256 yMagnitude = abs(y);
        uint256 denominatorMagnitude = abs(denominator);
        uint256 magnitude = mulDiv(xMagnitude, yMagnitude, denominatorMagnitude, Rounding.Down);

        bool hasRemainder = mulmod(xMagnitude, yMagnitude, denominatorMagnitude) != 0;
        bool incrementMagnitude =
            hasRemainder && ((negative && rounding == Rounding.Down) || (!negative && rounding == Rounding.Up));

        if (incrementMagnitude) {
            if (magnitude == type(uint256).max) revert LiquidOBMathOverflow();
            unchecked {
                ++magnitude;
            }
        }

        return _fromMagnitude(magnitude, negative);
    }

    /// @notice Multiplies two signed WAD values and returns a signed WAD value.
    function mulWadSigned(int256 xWad, int256 yWad, Rounding rounding) internal pure returns (int256) {
        return mulDivSigned(xWad, yWad, WAD_INT, rounding);
    }

    /// @notice Divides two signed WAD values and returns a signed WAD value.
    function divWadSigned(int256 xWad, int256 yWad, Rounding rounding) internal pure returns (int256) {
        return mulDivSigned(xWad, WAD_INT, yWad, rounding);
    }

    /// @notice Returns the unsigned magnitude, including for `int256.min`.
    function abs(int256 value) internal pure returns (uint256) {
        if (value >= 0) return SafeCast.toUint256(value);
        unchecked {
            return SafeCast.toUint256(-(value + 1)) + 1;
        }
    }

    /// @notice Converts an unsigned value to signed form without truncation.
    function toInt256(uint256 value) internal pure returns (int256) {
        if (value > uint256(type(int256).max)) revert LiquidOBMathOverflow();
        return SafeCast.toInt256(value);
    }

    /// @notice Converts a nonnegative signed value to unsigned form.
    function toUint256(int256 value) internal pure returns (uint256) {
        if (value < 0) revert LiquidOBNegativeToUnsigned(value);
        return SafeCast.toUint256(value);
    }

    /// @notice Narrows a normalized amount to the canonical uint128 wire domain.
    function toAmountWad(uint256 value) internal pure returns (AmountWad) {
        if (value > type(uint128).max) revert LiquidOBAmountOverflow(value);
        return AmountWad.wrap(SafeCast.toUint128(value));
    }

    /// @notice Converts a raw ERC-20 amount with at most 18 decimals into AmountWad exactly.
    function rawToWad(address token, uint256 rawAmount, uint8 tokenDecimals) internal pure returns (AmountWad) {
        uint256 factor = _normalizationFactor(token, tokenDecimals);
        if (rawAmount > type(uint128).max / factor) revert LiquidOBAmountOverflow(rawAmount);
        return toAmountWad(rawAmount * factor);
    }

    /// @notice Converts AmountWad to raw ERC-20 units with an explicit transfer rounding direction.
    function wadToRaw(address token, AmountWad amount, uint8 tokenDecimals, Rounding rounding)
        internal
        pure
        returns (uint256)
    {
        uint256 factor = _normalizationFactor(token, tokenDecimals);
        return div(uint256(AmountWad.unwrap(amount)), factor, rounding);
    }

    /// @notice Adds two canonical reserves and rejects uint128 overflow.
    function addAmount(AmountWad left, AmountWad right) internal pure returns (AmountWad) {
        uint256 sum = uint256(AmountWad.unwrap(left)) + uint256(AmountWad.unwrap(right));
        return toAmountWad(sum);
    }

    /// @notice Subtracts canonical reserves and rejects reserve underflow.
    function subAmount(AmountWad left, AmountWad right) internal pure returns (AmountWad) {
        uint128 leftValue = AmountWad.unwrap(left);
        uint128 rightValue = AmountWad.unwrap(right);
        if (rightValue > leftValue) revert LiquidOBMathUnderflow();
        return AmountWad.wrap(leftValue - rightValue);
    }

    /// @notice Scales a reserve by `numerator / denominator` without intermediate overflow.
    function scaleAmount(AmountWad amount, AmountWad numerator, AmountWad denominator, Rounding rounding)
        internal
        pure
        returns (AmountWad)
    {
        uint256 scaled = mulDiv(
            uint256(AmountWad.unwrap(amount)),
            uint256(AmountWad.unwrap(numerator)),
            uint256(AmountWad.unwrap(denominator)),
            rounding
        );
        return toAmountWad(scaled);
    }

    function _fromMagnitude(uint256 magnitude, bool negative) private pure returns (int256) {
        uint256 minimumMagnitude = uint256(1) << 255;
        if (negative) {
            if (magnitude > minimumMagnitude) revert LiquidOBMathOverflow();
            if (magnitude == minimumMagnitude) return type(int256).min;
            return -SafeCast.toInt256(magnitude);
        }

        if (magnitude >= minimumMagnitude) revert LiquidOBMathOverflow();
        return SafeCast.toInt256(magnitude);
    }

    function _normalizationFactor(address token, uint8 tokenDecimals) private pure returns (uint256) {
        if (tokenDecimals > MAX_TOKEN_DECIMALS) {
            revert LiquidOBUnsupportedTokenDecimals(token, tokenDecimals);
        }
        return 10 ** (MAX_TOKEN_DECIMALS - tokenDecimals);
    }
}
