// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";

import {Rounding} from "../types/CurveTypes.sol";
import {
    LiquidOBExponentialOutOfDomain,
    LiquidOBInvalidLog1pInput,
    LiquidOBInvalidLogarithmInput,
    LiquidOBPowerOutOfDomain
} from "../types/ProtocolErrors.sol";
import {FullPrecisionMath} from "./FullPrecisionMath.sol";

/// @notice Bounded signed-WAD logarithm, exponential, and positive-base power primitives.
/// @dev Solady supplies deterministic monotone approximations. Liquid OB owns the
///      narrower canonical domains, exact identities, full-precision power product,
///      cancellation-safe near-zero branches, and conservative uncertainty intervals.
library TranscendentalMath {
    uint256 internal constant WAD = 1e18;
    int256 internal constant WAD_INT = 1e18;

    /// @dev Keeps every exponential result positive and below uint128 with ample headroom.
    int256 internal constant MIN_EXP_INPUT_WAD = -40e18;
    int256 internal constant MAX_EXP_INPUT_WAD = 47e18;
    uint256 internal constant MAX_EXP_MAGNITUDE_WAD = 47e18;
    uint256 internal constant NEAR_ZERO_WAD = 1e9;
    int256 internal constant MAX_LOG1P_INPUT_WAD = 340282366920938463462374607431768211455;

    /// @dev Engineering envelopes for the pinned Solady v0.1.26 backend.
    int256 internal constant LN_ABS_ERROR_WAD = 2;
    uint256 internal constant EXP_ABS_ERROR_WAD = 2;
    uint256 internal constant EXP_REL_ERROR_WAD = 1; // 1e-18 relative.

    /// @notice Returns an approximation of `ln(xWad / WAD) * WAD`.
    function lnWad(uint256 xWad) internal pure returns (int256) {
        _requireLogInput(xWad);
        if (xWad == WAD) return 0;
        return FixedPointMathLib.lnWad(FullPrecisionMath.toInt256(xWad));
    }

    /// @notice Returns a conservative integer interval containing the real WAD logarithm.
    function lnWadBounds(uint256 xWad) internal pure returns (int256 lowerWad, int256 upperWad) {
        int256 estimate = lnWad(xWad);
        if (xWad == WAD) return (0, 0);
        return (estimate - LN_ABS_ERROR_WAD, estimate + LN_ABS_ERROR_WAD);
    }

    /// @notice Returns an approximation of `exp(xWad / WAD) * WAD`.
    function expWad(int256 xWad) internal pure returns (uint256 resultWad) {
        _requireExpInput(xWad);
        if (xWad == 0) return WAD;

        resultWad = FullPrecisionMath.toUint256(FixedPointMathLib.expWad(xWad));
        assert(resultWad > 0 && resultWad <= type(uint128).max);
    }

    /// @notice Returns a conservative integer interval containing the real WAD exponential.
    function expWadBounds(int256 xWad) internal pure returns (uint256 lowerWad, uint256 upperWad) {
        uint256 estimate = expWad(xWad);
        if (xWad == 0) return (WAD, WAD);

        uint256 error = expErrorBoundWad(estimate);
        lowerWad = estimate > error ? estimate - error : 0;
        upperWad = estimate + error;
        assert(upperWad <= type(uint128).max);
    }

    /// @notice Returns a stable approximation of `exp(x) - 1`, denominated in WAD.
    function expm1Wad(int256 xWad) internal pure returns (int256) {
        _requireExpInput(xWad);
        if (xWad == 0 || _isNearZero(xWad)) return xWad;
        return FullPrecisionMath.toInt256(expWad(xWad)) - WAD_INT;
    }

    /// @notice Returns a conservative interval for `exp(x) - 1`, denominated in WAD.
    function expm1WadBounds(int256 xWad) internal pure returns (int256 lowerWad, int256 upperWad) {
        _requireExpInput(xWad);
        if (xWad == 0) return (0, 0);
        if (_isNearZero(xWad)) return (xWad - 1, xWad + 1);

        (uint256 expLower, uint256 expUpper) = expWadBounds(xWad);
        return (FullPrecisionMath.toInt256(expLower) - WAD_INT, FullPrecisionMath.toInt256(expUpper) - WAD_INT);
    }

    /// @notice Returns a stable approximation of `ln(1 + x)`, denominated in WAD.
    function log1pWad(int256 xWad) internal pure returns (int256) {
        uint256 argumentWad = _log1pArgument(xWad);
        if (xWad == 0 || _isNearZero(xWad)) return xWad;
        return lnWad(argumentWad);
    }

    /// @notice Returns a conservative interval for `ln(1 + x)`, denominated in WAD.
    function log1pWadBounds(int256 xWad) internal pure returns (int256 lowerWad, int256 upperWad) {
        uint256 argumentWad = _log1pArgument(xWad);
        if (xWad == 0) return (0, 0);
        if (_isNearZero(xWad)) return (xWad - 1, xWad + 1);
        return lnWadBounds(argumentWad);
    }

    /// @notice Returns an approximation of `(baseWad / WAD)^(exponentWad / WAD) * WAD`.
    function powWad(uint256 baseWad, int256 exponentWad) internal pure returns (uint256) {
        _requirePowerBase(baseWad, exponentWad);
        if (exponentWad == 0 || baseWad == WAD) return WAD;
        if (exponentWad == WAD_INT) return baseWad;

        _powerArgumentBounds(baseWad, exponentWad);
        int256 logarithm = lnWad(baseWad);
        int256 expInput = _mulWadTowardZero(logarithm, exponentWad);
        return expWad(expInput);
    }

    /// @notice Returns a conservative integer interval containing a positive real power.
    function powWadBounds(uint256 baseWad, int256 exponentWad)
        internal
        pure
        returns (uint256 lowerWad, uint256 upperWad)
    {
        _requirePowerBase(baseWad, exponentWad);
        if (exponentWad == 0 || baseWad == WAD) return (WAD, WAD);
        if (exponentWad == WAD_INT) return (baseWad, baseWad);

        (int256 lowerInput, int256 upperInput) = _powerArgumentBounds(baseWad, exponentWad);
        (lowerWad,) = expWadBounds(lowerInput);
        (, upperWad) = expWadBounds(upperInput);
    }

    /// @notice Conservative absolute error for an exponential estimate in WAD units.
    function expErrorBoundWad(uint256 estimateWad) internal pure returns (uint256) {
        return FullPrecisionMath.mulDiv(estimateWad, EXP_REL_ERROR_WAD, WAD, Rounding.Up) + EXP_ABS_ERROR_WAD;
    }

    function _powerArgumentBounds(uint256 baseWad, int256 exponentWad)
        private
        pure
        returns (int256 lowerInputWad, int256 upperInputWad)
    {
        (int256 logLower, int256 logUpper) = lnWadBounds(baseWad);
        if (exponentWad >= 0) {
            lowerInputWad = _mulPowerWad(exponentWad, logLower, Rounding.Down, baseWad);
            upperInputWad = _mulPowerWad(exponentWad, logUpper, Rounding.Up, baseWad);
        } else {
            lowerInputWad = _mulPowerWad(exponentWad, logUpper, Rounding.Down, baseWad);
            upperInputWad = _mulPowerWad(exponentWad, logLower, Rounding.Up, baseWad);
        }

        if (lowerInputWad < MIN_EXP_INPUT_WAD || upperInputWad > MAX_EXP_INPUT_WAD) {
            revert LiquidOBPowerOutOfDomain(baseWad, exponentWad);
        }
    }

    function _mulWadTowardZero(int256 leftWad, int256 rightWad) private pure returns (int256) {
        bool negative = (leftWad < 0) != (rightWad < 0);
        return FullPrecisionMath.mulWadSigned(leftWad, rightWad, negative ? Rounding.Up : Rounding.Down);
    }

    function _mulPowerWad(int256 leftWad, int256 rightWad, Rounding rounding, uint256 baseWad)
        private
        pure
        returns (int256)
    {
        uint256 leftMagnitude = FullPrecisionMath.abs(leftWad);
        uint256 rightMagnitude = FullPrecisionMath.abs(rightWad);
        uint256 maximumProduct = MAX_EXP_MAGNITUDE_WAD * WAD;
        if (leftMagnitude != 0 && rightMagnitude > maximumProduct / leftMagnitude) {
            revert LiquidOBPowerOutOfDomain(baseWad, leftWad);
        }
        return FullPrecisionMath.mulWadSigned(leftWad, rightWad, rounding);
    }

    function _log1pArgument(int256 xWad) private pure returns (uint256) {
        if (xWad <= -WAD_INT || xWad > MAX_LOG1P_INPUT_WAD) revert LiquidOBInvalidLog1pInput(xWad);
        return FullPrecisionMath.toUint256(WAD_INT + xWad);
    }

    function _requireLogInput(uint256 xWad) private pure {
        if (xWad == 0 || xWad > type(uint128).max) revert LiquidOBInvalidLogarithmInput(xWad);
    }

    function _requireExpInput(int256 xWad) private pure {
        if (xWad < MIN_EXP_INPUT_WAD || xWad > MAX_EXP_INPUT_WAD) {
            revert LiquidOBExponentialOutOfDomain(xWad);
        }
    }

    function _requirePowerBase(uint256 baseWad, int256 exponentWad) private pure {
        if (baseWad == 0 || baseWad > type(uint128).max) {
            revert LiquidOBPowerOutOfDomain(baseWad, exponentWad);
        }
    }

    function _isNearZero(int256 xWad) private pure returns (bool) {
        return FullPrecisionMath.abs(xWad) <= NEAR_ZERO_WAD;
    }
}
