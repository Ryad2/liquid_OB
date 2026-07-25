// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {
    AmountWad,
    CurveBranch,
    CurveQuote,
    CurveSide,
    CurveState,
    NativeCurve,
    PriceWad,
    QuoteKind,
    RateWad,
    Rounding,
    UnitlessWad
} from "../types/CurveTypes.sol";
import {LiquidOBCurveOutOfDomain, LiquidOBNonMonotonicRate, LiquidOBZeroAmount} from "../types/ProtocolErrors.sol";
import {CurveCompiler} from "./CurveCompiler.sol";
import {FullPrecisionMath} from "./FullPrecisionMath.sol";
import {TranscendentalMath} from "./TranscendentalMath.sol";

/// @notice Pure reduced-coordinate quote kernel for one compiled native curve.
library CurveMath {
    uint256 internal constant WAD = 1e18;
    int256 internal constant WAD_INT = 1e18;

    function quoteExactInput(NativeCurve memory curve, CurveState memory state, CurveSide side, AmountWad amountInWad)
        internal
        pure
        returns (CurveQuote memory quote)
    {
        uint256 amountIn = AmountWad.unwrap(amountInWad);
        if (amountIn == 0) revert LiquidOBZeroAmount();
        _validateState(state);

        uint256 yBefore = AmountWad.unwrap(state.y);
        uint256 xBefore = xAtY(curve, state, yBefore, Rounding.Down);
        uint256 xAfter = xBefore + amountIn;
        uint256 yAfter = yAtX(curve, state, xAfter);
        if (yAfter >= yBefore) revert LiquidOBCurveOutOfDomain();

        uint256 amountOut = yBefore - yAfter;
        quote = _buildQuote(curve, state, side, QuoteKind.ExactInput, amountIn, amountOut, yAfter);
    }

    function quoteExactOutput(NativeCurve memory curve, CurveState memory state, CurveSide side, AmountWad amountOutWad)
        internal
        pure
        returns (CurveQuote memory quote)
    {
        uint256 amountOut = AmountWad.unwrap(amountOutWad);
        if (amountOut == 0) revert LiquidOBZeroAmount();
        _validateState(state);

        uint256 yBefore = AmountWad.unwrap(state.y);
        if (amountOut > yBefore) revert LiquidOBCurveOutOfDomain();
        uint256 yAfter = yBefore - amountOut;
        uint256 xBefore = xAtY(curve, state, yBefore, Rounding.Down);
        uint256 xAfter = xAtY(curve, state, yAfter, Rounding.Up);
        if (xAfter <= xBefore) revert LiquidOBCurveOutOfDomain();

        uint256 amountIn = xAfter - xBefore;
        quote = _buildQuote(curve, state, side, QuoteKind.ExactOutput, amountIn, amountOut, yAfter);
    }

    function marginalRate(NativeCurve memory curve, CurveState memory state) internal pure returns (RateWad) {
        return _toRate(marginalRateAt(curve, state, AmountWad.unwrap(state.y)));
    }

    function marginalRateAt(NativeCurve memory curve, CurveState memory state, uint256 yWad)
        internal
        pure
        returns (uint256 rateWad)
    {
        _validateState(state);
        uint256 yInt = AmountWad.unwrap(state.yInt);
        if (yWad > yInt) revert LiquidOBCurveOutOfDomain();
        if (curve.branch == CurveBranch.Flat) return RateWad.unwrap(curve.kappa);

        uint256 rWad = FullPrecisionMath.divWad(yWad, yInt, Rounding.Down);
        uint256 muWad = UnitlessWad.unwrap(curve.mu);
        uint256 kappaWad = RateWad.unwrap(curve.kappa);

        if (curve.branch == CurveBranch.NativeAlphaZero) {
            uint256 alphaZeroExponent = FullPrecisionMath.mulWad(muWad, rWad, Rounding.Down);
            uint256 alphaZeroScale = FullPrecisionMath.divWad(kappaWad, muWad, Rounding.Down);
            return FullPrecisionMath.mulWad(
                alphaZeroScale, TranscendentalMath.expWad(FullPrecisionMath.toInt256(alphaZeroExponent)), Rounding.Down
            );
        }

        uint256 zWad = WAD - FullPrecisionMath.mulWad(muWad, WAD - rWad, Rounding.Down);
        if (curve.branch == CurveBranch.NativeAlphaOne) {
            uint256 alphaOneScale = FullPrecisionMath.divWad(kappaWad, muWad, Rounding.Down);
            return FullPrecisionMath.mulWad(alphaOneScale, zWad, Rounding.Down);
        }

        uint256 gammaWad = CurveCompiler.gamma(curve);
        uint256 scaleDenominator = FullPrecisionMath.mulWad(muWad, gammaWad, Rounding.Down);
        uint256 scale = FullPrecisionMath.divWad(kappaWad, scaleDenominator, Rounding.Down);

        uint256 base;
        int256 exponent;
        if (curve.alphaNative < 0) {
            base = WAD - FullPrecisionMath.mulWad(muWad, rWad, Rounding.Down);
            exponent = WAD_INT - FullPrecisionMath.toInt256(gammaWad);
        } else if (curve.alphaNative > WAD_INT) {
            base = zWad;
            exponent = WAD_INT - FullPrecisionMath.toInt256(gammaWad);
        } else {
            base = zWad;
            exponent = WAD_INT + FullPrecisionMath.toInt256(gammaWad);
        }

        rateWad = FullPrecisionMath.mulWad(scale, TranscendentalMath.powWad(base, exponent), Rounding.Down);
    }

    /// @notice Returns the derived incoming coordinate at an outgoing reserve value.
    function xAtY(NativeCurve memory curve, CurveState memory state, uint256 yWad, Rounding rounding)
        internal
        pure
        returns (uint256 xWad)
    {
        _validateState(state);
        uint256 yInt = AmountWad.unwrap(state.yInt);
        if (yWad > yInt) revert LiquidOBCurveOutOfDomain();

        if (curve.branch == CurveBranch.Flat) {
            return FullPrecisionMath.divWad(yInt - yWad, RateWad.unwrap(curve.kappa), rounding);
        }

        uint256 muWad = UnitlessWad.unwrap(curve.mu);
        uint256 kappaWad = RateWad.unwrap(curve.kappa);
        uint256 rWad = FullPrecisionMath.divWad(yWad, yInt, Rounding.Down);
        uint256 termWad;

        if (curve.branch == CurveBranch.NativeAlphaZero) {
            uint256 currentExponent = FullPrecisionMath.mulWad(muWad, rWad, Rounding.Down);
            uint256 current = TranscendentalMath.expWad(-FullPrecisionMath.toInt256(currentExponent));
            uint256 terminal = TranscendentalMath.expWad(-FullPrecisionMath.toInt256(muWad));
            if (current < terminal) revert LiquidOBCurveOutOfDomain();
            termWad = current - terminal;
        } else if (curve.branch == CurveBranch.NativeAlphaOne) {
            uint256 zWad = WAD - FullPrecisionMath.mulWad(muWad, WAD - rWad, Rounding.Down);
            int256 logarithm = TranscendentalMath.lnWad(zWad);
            if (logarithm > 0) revert LiquidOBCurveOutOfDomain();
            termWad = FullPrecisionMath.abs(logarithm);
        } else {
            uint256 gammaWad = CurveCompiler.gamma(curve);
            if (curve.alphaNative < 0) {
                uint256 currentBase = WAD - FullPrecisionMath.mulWad(muWad, rWad, Rounding.Down);
                uint256 terminalBase = WAD - muWad;
                uint256 current = TranscendentalMath.powWad(currentBase, FullPrecisionMath.toInt256(gammaWad));
                uint256 terminal = TranscendentalMath.powWad(terminalBase, FullPrecisionMath.toInt256(gammaWad));
                if (current < terminal) revert LiquidOBCurveOutOfDomain();
                termWad = current - terminal;
            } else {
                uint256 zWad = WAD - FullPrecisionMath.mulWad(muWad, WAD - rWad, Rounding.Down);
                if (curve.alphaNative > WAD_INT) {
                    uint256 powered = TranscendentalMath.powWad(zWad, FullPrecisionMath.toInt256(gammaWad));
                    if (powered > WAD) revert LiquidOBCurveOutOfDomain();
                    termWad = WAD - powered;
                } else {
                    uint256 powered = TranscendentalMath.powWad(zWad, -FullPrecisionMath.toInt256(gammaWad));
                    if (powered < WAD) revert LiquidOBCurveOutOfDomain();
                    termWad = powered - WAD;
                }
            }
        }

        xWad = FullPrecisionMath.mulDiv(yInt, termWad, kappaWad, rounding);
    }

    /// @notice Inverts the reduced coordinate and rounds reserve upward for maker-safe exact input.
    function yAtX(NativeCurve memory curve, CurveState memory state, uint256 xWad)
        internal
        pure
        returns (uint256 yWad)
    {
        _validateState(state);
        uint256 yInt = AmountWad.unwrap(state.yInt);
        uint256 maximumX = xAtY(curve, state, 0, Rounding.Up);
        if (xWad > maximumX) revert LiquidOBCurveOutOfDomain();

        if (curve.branch == CurveBranch.Flat) {
            uint256 consumed = FullPrecisionMath.mulWad(xWad, RateWad.unwrap(curve.kappa), Rounding.Down);
            if (consumed > yInt) revert LiquidOBCurveOutOfDomain();
            return yInt - consumed;
        }

        uint256 muWad = UnitlessWad.unwrap(curve.mu);
        uint256 kappaWad = RateWad.unwrap(curve.kappa);
        uint256 scaledX = FullPrecisionMath.mulDiv(kappaWad, xWad, yInt, Rounding.Down);
        uint256 normalized;

        if (curve.branch == CurveBranch.NativeAlphaZero) {
            uint256 terminal = TranscendentalMath.expWad(-FullPrecisionMath.toInt256(muWad));
            uint256 inside = terminal + scaledX;
            int256 logarithm = TranscendentalMath.lnWad(inside);
            if (logarithm > 0) revert LiquidOBCurveOutOfDomain();
            return FullPrecisionMath.mulDiv(yInt, FullPrecisionMath.abs(logarithm), muWad, Rounding.Up);
        }

        if (curve.branch == CurveBranch.NativeAlphaOne) {
            uint256 decayed = TranscendentalMath.expWad(-FullPrecisionMath.toInt256(scaledX));
            if (decayed + muWad < WAD) revert LiquidOBCurveOutOfDomain();
            normalized = decayed + muWad - WAD;
            return FullPrecisionMath.mulDiv(yInt, normalized, muWad, Rounding.Up);
        }

        uint256 gammaWad = CurveCompiler.gamma(curve);
        int256 reciprocalGamma =
            FullPrecisionMath.divWadSigned(WAD_INT, FullPrecisionMath.toInt256(gammaWad), Rounding.Up);

        if (curve.alphaNative < 0) {
            uint256 terminalBase = WAD - muWad;
            uint256 terminal = TranscendentalMath.powWad(terminalBase, FullPrecisionMath.toInt256(gammaWad));
            uint256 powered = TranscendentalMath.powWad(terminal + scaledX, reciprocalGamma);
            if (powered > WAD) revert LiquidOBCurveOutOfDomain();
            normalized = WAD - powered;
        } else if (curve.alphaNative > WAD_INT) {
            if (scaledX > WAD) revert LiquidOBCurveOutOfDomain();
            uint256 powered = TranscendentalMath.powWad(WAD - scaledX, reciprocalGamma);
            if (powered + muWad < WAD) revert LiquidOBCurveOutOfDomain();
            normalized = powered + muWad - WAD;
        } else {
            uint256 powered = TranscendentalMath.powWad(WAD + scaledX, -reciprocalGamma);
            if (powered + muWad < WAD) revert LiquidOBCurveOutOfDomain();
            normalized = powered + muWad - WAD;
        }

        yWad = FullPrecisionMath.mulDiv(yInt, normalized, muWad, Rounding.Up);
        if (yWad > yInt) revert LiquidOBCurveOutOfDomain();
    }

    function _buildQuote(
        NativeCurve memory curve,
        CurveState memory state,
        CurveSide side,
        QuoteKind kind,
        uint256 amountIn,
        uint256 amountOut,
        uint256 yAfter
    ) private pure returns (CurveQuote memory quote) {
        if (amountIn == 0 || amountOut == 0) revert LiquidOBZeroAmount();
        uint256 rateBefore = marginalRateAt(curve, state, AmountWad.unwrap(state.y));
        uint256 rateAfter = marginalRateAt(curve, state, yAfter);
        if (rateAfter > rateBefore) revert LiquidOBNonMonotonicRate(rateBefore, rateAfter);

        uint256 effectiveRate = FullPrecisionMath.divWad(amountOut, amountIn, Rounding.Down);
        if (effectiveRate == 0) revert LiquidOBCurveOutOfDomain();
        uint256 displayedBefore = _displayedPrice(side, rateBefore);
        uint256 displayedAfter = _displayedPrice(side, rateAfter);
        uint256 displayedEffective =
            side == CurveSide.Buy ? effectiveRate : FullPrecisionMath.divWad(amountIn, amountOut, Rounding.Up);

        CurveState memory afterState = CurveState({y: _toAmount(yAfter), yInt: state.yInt});
        quote = CurveQuote({
            kind: kind,
            side: side,
            amountIn: amountIn,
            amountOut: amountOut,
            amountInWad: _toAmount(amountIn),
            amountOutWad: _toAmount(amountOut),
            nativeRateBefore: _toRate(rateBefore),
            nativeRateAfter: _toRate(rateAfter),
            nativeEffectiveRate: _toRate(effectiveRate),
            displayedPriceBefore: _toPrice(displayedBefore),
            displayedPriceAfter: _toPrice(displayedAfter),
            displayedEffectivePrice: _toPrice(displayedEffective),
            activeBefore: state,
            activeAfter: afterState
        });
    }

    function _displayedPrice(CurveSide side, uint256 nativeRate) private pure returns (uint256) {
        return side == CurveSide.Buy ? nativeRate : FullPrecisionMath.reciprocalWad(nativeRate, Rounding.Up);
    }

    function _validateState(CurveState memory state) private pure {
        uint256 y = AmountWad.unwrap(state.y);
        uint256 yInt = AmountWad.unwrap(state.yInt);
        if (yInt == 0 || y > yInt) revert LiquidOBCurveOutOfDomain();
    }

    function _toAmount(uint256 value) private pure returns (AmountWad) {
        return FullPrecisionMath.toAmountWad(value);
    }

    function _toRate(uint256 value) private pure returns (RateWad) {
        if (value == 0 || value > type(uint128).max) revert LiquidOBCurveOutOfDomain();
        // forge-lint: disable-next-line(unsafe-typecast)
        return RateWad.wrap(uint128(value));
    }

    function _toPrice(uint256 value) private pure returns (PriceWad) {
        if (value == 0 || value > type(uint128).max) revert LiquidOBCurveOutOfDomain();
        // forge-lint: disable-next-line(unsafe-typecast)
        return PriceWad.wrap(uint128(value));
    }
}
