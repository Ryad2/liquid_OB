// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {
    AlphaWad,
    CurveBranch,
    CurveConfig,
    CurveSide,
    CurveTypesLib,
    NativeCurve,
    PriceWad,
    RateWad,
    Rounding,
    UnitlessWad
} from "../types/CurveTypes.sol";
import {LiquidOBInvalidCurveCommitment} from "../types/ProtocolErrors.sol";
import {FullPrecisionMath} from "./FullPrecisionMath.sol";
import {TranscendentalMath} from "./TranscendentalMath.sol";

/// @notice Compiles displayed quote/base policy into one native output/input curve.
library CurveCompiler {
    uint256 internal constant WAD = 1e18;
    int256 internal constant WAD_INT = 1e18;
    uint256 internal constant COMMITMENT_TOLERANCE_WAD = 1e9;

    /// @notice Derives canonical `mu` and `kappa` while preserving maker inputs.
    function derive(CurveConfig memory config, CurveSide side) internal pure returns (CurveConfig memory derived) {
        derived = config;
        (NativeCurve memory curve, uint256 muWad, uint256 kappaWad) = _deriveNative(config, side);

        if (curve.branch == CurveBranch.Flat) {
            derived.alpha = AlphaWad.wrap(0);
        }
        derived.mu = UnitlessWad.wrap(_toUint128AllowZero(muWad, side));
        derived.kappa = RateWad.wrap(_toUint128(kappaWad, side));
    }

    /// @notice Validates supplied commitments and returns the native curve.
    function compile(CurveConfig memory config, CurveSide side) internal pure returns (NativeCurve memory curve) {
        uint256 expectedMu;
        uint256 expectedKappa;
        (curve, expectedMu, expectedKappa) = _deriveNative(config, side);

        if (
            !_approximatelyEqual(UnitlessWad.unwrap(config.mu), expectedMu)
                || !_approximatelyEqual(RateWad.unwrap(config.kappa), expectedKappa)
        ) {
            revert LiquidOBInvalidCurveCommitment(side);
        }
    }

    function _deriveNative(CurveConfig memory config, CurveSide side)
        private
        pure
        returns (NativeCurve memory curve, uint256 muWad, uint256 kappaWad)
    {
        uint256 startPrice = PriceWad.unwrap(config.startPrice);
        uint256 endPrice = PriceWad.unwrap(config.endPrice);
        int256 alphaNative = CurveTypesLib.nativeAlphaWad(config, side);
        CurveBranch branch = CurveTypesLib.branch(config, side);

        uint256 pHigh;
        uint256 pLow;
        if (side == CurveSide.Buy) {
            pHigh = startPrice;
            pLow = endPrice;
        } else {
            pHigh = FullPrecisionMath.reciprocalWad(startPrice, Rounding.Down);
            pLow = FullPrecisionMath.reciprocalWad(endPrice, Rounding.Down);
        }

        if (branch == CurveBranch.Flat) {
            muWad = 0;
            kappaWad = pHigh;
        } else {
            if (pLow == 0 || pLow >= pHigh) revert LiquidOBInvalidCurveCommitment(side);
            muWad = _deriveMu(pLow, pHigh, alphaNative, side);
            kappaWad = _deriveKappa(muWad, pLow, pHigh, alphaNative, side);
        }

        curve = NativeCurve({
            branch: branch,
            alphaNative: alphaNative,
            betaNative: alphaNative - WAD_INT,
            pLow: RateWad.wrap(_toUint128(pLow, side)),
            pHigh: RateWad.wrap(_toUint128(pHigh, side)),
            mu: UnitlessWad.wrap(_toUint128AllowZero(muWad, side)),
            kappa: RateWad.wrap(_toUint128(kappaWad, side))
        });
    }

    function _deriveMu(uint256 pLow, uint256 pHigh, int256 alphaNative, CurveSide side)
        private
        pure
        returns (uint256 muWad)
    {
        if (alphaNative == 0) {
            uint256 ratio = FullPrecisionMath.divWad(pHigh, pLow, Rounding.Down);
            int256 logarithm = TranscendentalMath.lnWad(ratio);
            if (logarithm <= 0) revert LiquidOBInvalidCurveCommitment(side);
            return FullPrecisionMath.toUint256(logarithm);
        }

        uint256 base = alphaNative > 0
            ? FullPrecisionMath.divWad(pLow, pHigh, Rounding.Down)
            : FullPrecisionMath.divWad(pHigh, pLow, Rounding.Down);
        uint256 powered = TranscendentalMath.powWad(base, alphaNative);
        if (powered >= WAD) revert LiquidOBInvalidCurveCommitment(side);
        muWad = WAD - powered;
    }

    function _deriveKappa(uint256 muWad, uint256 pLow, uint256 pHigh, int256 alphaNative, CurveSide side)
        private
        pure
        returns (uint256 kappaWad)
    {
        if (muWad == 0) revert LiquidOBInvalidCurveCommitment(side);
        if (alphaNative == WAD_INT) return FullPrecisionMath.mulWad(muWad, pHigh, Rounding.Down);
        if (alphaNative == 0) return FullPrecisionMath.mulWad(muWad, pLow, Rounding.Down);

        uint256 gammaWad = _gamma(alphaNative, side);
        uint256 anchor = alphaNative > 0 ? pHigh : pLow;
        kappaWad =
            FullPrecisionMath.mulWad(FullPrecisionMath.mulWad(muWad, gammaWad, Rounding.Down), anchor, Rounding.Down);
        if (kappaWad == 0) revert LiquidOBInvalidCurveCommitment(side);
    }

    function gamma(NativeCurve memory curve) internal pure returns (uint256) {
        return _gamma(curve.alphaNative, CurveSide.Sell);
    }

    function _gamma(int256 alphaNative, CurveSide side) private pure returns (uint256 gammaWad) {
        if (alphaNative == 0 || alphaNative == WAD_INT) revert LiquidOBInvalidCurveCommitment(side);
        uint256 numerator = FullPrecisionMath.abs(alphaNative - WAD_INT);
        gammaWad = FullPrecisionMath.mulDiv(numerator, WAD, FullPrecisionMath.abs(alphaNative), Rounding.Down);
        if (gammaWad == 0) revert LiquidOBInvalidCurveCommitment(side);
    }

    function _approximatelyEqual(uint256 supplied, uint256 expected) private pure returns (bool) {
        uint256 difference = supplied >= expected ? supplied - expected : expected - supplied;
        return difference <= COMMITMENT_TOLERANCE_WAD;
    }

    function _toUint128(uint256 value, CurveSide side) private pure returns (uint128) {
        if (value == 0 || value > type(uint128).max) revert LiquidOBInvalidCurveCommitment(side);
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint128(value);
    }

    function _toUint128AllowZero(uint256 value, CurveSide side) private pure returns (uint128) {
        if (value > type(uint128).max) revert LiquidOBInvalidCurveCommitment(side);
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint128(value);
    }
}
