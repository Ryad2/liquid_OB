// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {Rounding} from "../../src/types/CurveTypes.sol";
import {
    LiquidOBExponentialOutOfDomain,
    LiquidOBInvalidLog1pInput,
    LiquidOBInvalidLogarithmInput,
    LiquidOBPowerOutOfDomain
} from "../../src/types/ProtocolErrors.sol";
import {FullPrecisionMath} from "../../src/libraries/FullPrecisionMath.sol";
import {TranscendentalMath} from "../../src/libraries/TranscendentalMath.sol";

contract TranscendentalMathHarness {
    function minExpInputWad() external pure returns (int256) {
        return TranscendentalMath.MIN_EXP_INPUT_WAD;
    }

    function maxExpInputWad() external pure returns (int256) {
        return TranscendentalMath.MAX_EXP_INPUT_WAD;
    }

    function nearZeroWad() external pure returns (uint256) {
        return TranscendentalMath.NEAR_ZERO_WAD;
    }

    function lnWad(uint256 xWad) external pure returns (int256) {
        return TranscendentalMath.lnWad(xWad);
    }

    function lnWadBounds(uint256 xWad) external pure returns (int256, int256) {
        return TranscendentalMath.lnWadBounds(xWad);
    }

    function expWad(int256 xWad) external pure returns (uint256) {
        return TranscendentalMath.expWad(xWad);
    }

    function expWadBounds(int256 xWad) external pure returns (uint256, uint256) {
        return TranscendentalMath.expWadBounds(xWad);
    }

    function expm1Wad(int256 xWad) external pure returns (int256) {
        return TranscendentalMath.expm1Wad(xWad);
    }

    function expm1WadBounds(int256 xWad) external pure returns (int256, int256) {
        return TranscendentalMath.expm1WadBounds(xWad);
    }

    function log1pWad(int256 xWad) external pure returns (int256) {
        return TranscendentalMath.log1pWad(xWad);
    }

    function log1pWadBounds(int256 xWad) external pure returns (int256, int256) {
        return TranscendentalMath.log1pWadBounds(xWad);
    }

    function powWad(uint256 baseWad, int256 exponentWad) external pure returns (uint256) {
        return TranscendentalMath.powWad(baseWad, exponentWad);
    }

    function powWadBounds(uint256 baseWad, int256 exponentWad) external pure returns (uint256, uint256) {
        return TranscendentalMath.powWadBounds(baseWad, exponentWad);
    }

    function expErrorBoundWad(uint256 estimateWad) external pure returns (uint256) {
        return TranscendentalMath.expErrorBoundWad(estimateWad);
    }
}

contract TranscendentalMathTest is Test {
    uint256 private constant WAD = 1e18;
    int256 private constant WAD_INT = 1e18;
    int256 private constant MIN_EXP_INPUT_WAD = -40e18;
    int256 private constant MAX_EXP_INPUT_WAD = 47e18;

    TranscendentalMathHarness private math;

    function setUp() public {
        math = new TranscendentalMathHarness();
    }

    function testPublishesCanonicalNumericalDomain() public view {
        assertEq(math.minExpInputWad(), MIN_EXP_INPUT_WAD);
        assertEq(math.maxExpInputWad(), MAX_EXP_INPUT_WAD);
        assertEq(math.nearZeroWad(), 1e9);

        uint256 maximum = math.expWad(MAX_EXP_INPUT_WAD);
        assertGt(maximum, 0);
        assertLe(maximum, type(uint128).max);
        assertGt(math.expWad(MIN_EXP_INPUT_WAD), 0);
    }

    function testExactIdentitiesBypassApproximation() public view {
        assertEq(math.lnWad(WAD), 0);
        assertEq(math.expWad(0), WAD);
        assertEq(math.expm1Wad(0), 0);
        assertEq(math.log1pWad(0), 0);

        assertEq(math.powWad(7e18, 0), WAD);
        assertEq(math.powWad(WAD, type(int128).max), WAD);
        assertEq(math.powWad(7e18, WAD_INT), 7e18);

        _assertLnInterval(WAD, 0, 0);
        _assertExpInterval(0, WAD, WAD);
        _assertPowInterval(7e18, WAD_INT, 7e18, 7e18);
    }

    function testLogarithmMatchesIndependentDecimalOracle() public view {
        assertEq(math.lnWad(1), -41446531673892822313);
        assertEq(math.lnWad(0.5e18), -693147180559945310);
        assertEq(math.lnWad(2e18), 693147180559945309);
        assertEq(math.lnWad(10e18), 2302585092994045683);
        assertEq(math.lnWad(type(uint128).max), 47276307437780177293);

        _assertLnContains(1, -41446531673892822313, -41446531673892822312);
        _assertLnContains(0.5e18, -693147180559945310, -693147180559945309);
        _assertLnContains(2e18, 693147180559945309, 693147180559945310);
        _assertLnContains(10e18, 2302585092994045684, 2302585092994045685);
        _assertLnContains(type(uint128).max, 47276307437780177293, 47276307437780177294);
    }

    function testExponentialMatchesIndependentDecimalOracle() public view {
        assertEq(math.expWad(-1e18), 367879441171442321);
        assertEq(math.expWad(1e18), 2718281828459045235);

        _assertExpContains(-40e18, 4, 5);
        _assertExpContains(-20e18, 2061153622, 2061153623);
        _assertExpContains(-1e18, 367879441171442321, 367879441171442322);
        _assertExpContains(20e18, 485165195409790277969106830, 485165195409790277969106831);
        _assertExpContains(47e18, 258131288619006739623285800215273380431, 258131288619006739623285800215273380432);
    }

    function testNearZeroTransformsAvoidCancellation() public view {
        assertEq(math.expm1Wad(-1e9), -1e9);
        assertEq(math.expm1Wad(-1), -1);
        assertEq(math.expm1Wad(1), 1);
        assertEq(math.expm1Wad(1e9), 1e9);

        assertEq(math.log1pWad(-1e9), -1e9);
        assertEq(math.log1pWad(-1), -1);
        assertEq(math.log1pWad(1), 1);
        assertEq(math.log1pWad(1e9), 1e9);

        _assertExpm1Contains(-1, -1, 0);
        _assertExpm1Contains(1, 1, 2);
        _assertLog1pContains(-1, -2, -1);
        _assertLog1pContains(1, 0, 1);
    }

    function testTransformsMatchIndependentDecimalOracleAwayFromZero() public view {
        _assertExpm1Contains(-0.5e18, -393469340287366577, -393469340287366576);
        _assertExpm1Contains(0.5e18, 648721270700128146, 648721270700128147);
        _assertLog1pContains(-0.5e18, -693147180559945310, -693147180559945309);
        _assertLog1pContains(0.5e18, 405465108108164381, 405465108108164382);
    }

    function testPositiveRealPowerMatchesIndependentDecimalOracle() public view {
        _assertPowContains(2e18, 3e18, 7999999999999999999, 8000000000000000000);
        _assertPowContains(4e18, 0.5e18, 2e18, 2e18);
        _assertPowContains(0.25e18, -2e18, 16e18, 16e18 + 1);
        _assertPowContains(0.5e18, -3e18, 7999999999999999999, 8e18);
        _assertPowContains(WAD + 1, 20e18, WAD + 20, WAD + 21);

        assertApproxEqAbs(math.powWad(2e18, 3e18), 8e18, 64);
        assertApproxEqAbs(math.powWad(4e18, 0.5e18), 2e18, 32);
        assertApproxEqAbs(math.powWad(0.25e18, -2e18), 16e18, 128);
    }

    function testInverseCompositionStaysInsideDocumentedError() public view {
        int256[5] memory expInputs = [int256(-20e18), -1e18, 0, 1e18, 20e18];
        for (uint256 i; i < expInputs.length; ++i) {
            uint256 exponential = math.expWad(expInputs[i]);
            int256 roundTrip = math.lnWad(exponential);
            uint256 conditioningError =
                FullPrecisionMath.mulDiv(math.expErrorBoundWad(exponential), WAD, exponential, Rounding.Up);
            assertApproxEqAbs(roundTrip, expInputs[i], conditioningError + 2);
        }

        uint256[5] memory logInputs = [uint256(1e9), 0.5e18, 1e18, 2e18, 10e18];
        for (uint256 i; i < logInputs.length; ++i) {
            uint256 roundTrip = math.expWad(math.lnWad(logInputs[i]));
            uint256 propagatedLogError = FullPrecisionMath.mulDiv(logInputs[i], 2, WAD, Rounding.Up);
            uint256 error = math.expErrorBoundWad(logInputs[i]) + propagatedLogError + 2;
            assertApproxEqAbs(roundTrip, logInputs[i], error);
        }
    }

    function testRejectsLogarithmAndLog1pOutsideCanonicalDomain() public {
        vm.expectRevert(abi.encodeWithSelector(LiquidOBInvalidLogarithmInput.selector, uint256(0)));
        math.lnWad(0);

        uint256 tooLarge = uint256(type(uint128).max) + 1;
        vm.expectRevert(abi.encodeWithSelector(LiquidOBInvalidLogarithmInput.selector, tooLarge));
        math.lnWad(tooLarge);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBInvalidLog1pInput.selector, -WAD_INT));
        math.log1pWad(-WAD_INT);

        int256 tooLargeForLog1p = 340282366920938463462374607431768211456;
        vm.expectRevert(abi.encodeWithSelector(LiquidOBInvalidLog1pInput.selector, tooLargeForLog1p));
        math.log1pWad(tooLargeForLog1p);
    }

    function testRejectsExponentialOutsidePublishedDomain() public {
        int256 below = MIN_EXP_INPUT_WAD - 1;
        vm.expectRevert(abi.encodeWithSelector(LiquidOBExponentialOutOfDomain.selector, below));
        math.expWad(below);

        int256 above = MAX_EXP_INPUT_WAD + 1;
        vm.expectRevert(abi.encodeWithSelector(LiquidOBExponentialOutOfDomain.selector, above));
        math.expWad(above);
    }

    function testRejectsPowerOutsideBaseAndResultDomains() public {
        vm.expectRevert(abi.encodeWithSelector(LiquidOBPowerOutOfDomain.selector, uint256(0), WAD_INT));
        math.powWad(0, WAD_INT);

        uint256 tooLarge = uint256(type(uint128).max) + 1;
        vm.expectRevert(abi.encodeWithSelector(LiquidOBPowerOutOfDomain.selector, tooLarge, WAD_INT));
        math.powWad(tooLarge, WAD_INT);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBPowerOutOfDomain.selector, uint256(2e18), int256(100e18)));
        math.powWad(2e18, 100e18);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBPowerOutOfDomain.selector, uint256(0.5e18), int256(100e18)));
        math.powWad(0.5e18, 100e18);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBPowerOutOfDomain.selector, uint256(2e18), type(int256).max));
        math.powWad(2e18, type(int256).max);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBPowerOutOfDomain.selector, uint256(2e18), type(int256).min));
        math.powWad(2e18, type(int256).min);
    }

    function testFuzzLogarithmIsMonotone(uint128 leftSeed, uint128 rightSeed) public view {
        uint256 left = leftSeed == 0 ? 1 : uint256(leftSeed);
        uint256 right = rightSeed == 0 ? 1 : uint256(rightSeed);
        (left, right) = left <= right ? (left, right) : (right, left);

        assertLe(math.lnWad(left), math.lnWad(right));
    }

    function testFuzzExponentialIsMonotone(int128 leftSeed, int128 rightSeed) public view {
        int256 left = bound(int256(leftSeed), MIN_EXP_INPUT_WAD, MAX_EXP_INPUT_WAD);
        int256 right = bound(int256(rightSeed), MIN_EXP_INPUT_WAD, MAX_EXP_INPUT_WAD);
        (left, right) = left <= right ? (left, right) : (right, left);

        assertLe(math.expWad(left), math.expWad(right));
    }

    function testFuzzExponentialBoundsAreOrderedAndCanonical(int128 inputSeed) public view {
        int256 input = bound(int256(inputSeed), MIN_EXP_INPUT_WAD, MAX_EXP_INPUT_WAD);
        uint256 estimate = math.expWad(input);
        (uint256 lower, uint256 upper) = math.expWadBounds(input);

        assertLe(lower, estimate);
        assertLe(estimate, upper);
        assertGt(lower, 0);
        assertLe(upper, type(uint128).max);
    }

    function testFuzzLnExpRoundTrip(int128 inputSeed) public view {
        int256 input = bound(int256(inputSeed), -20e18, 20e18);
        uint256 exponential = math.expWad(input);
        uint256 conditioningError =
            FullPrecisionMath.mulDiv(math.expErrorBoundWad(exponential), WAD, exponential, Rounding.Up);
        assertApproxEqAbs(math.lnWad(exponential), input, conditioningError + 2);
    }

    function testFuzzPowerEstimateStaysInsideBounds(uint128 baseSeed, int128 exponentSeed) public view {
        uint256 base = 0.5e18 + uint256(baseSeed) % 1.5e18;
        int256 exponent = bound(int256(exponentSeed), -10e18, 10e18);
        uint256 estimate = math.powWad(base, exponent);
        (uint256 lower, uint256 upper) = math.powWadBounds(base, exponent);

        assertGt(lower, 0);
        assertLe(lower, estimate);
        assertLe(estimate, upper);
        assertLe(upper, type(uint128).max);
    }

    function testFuzzPowerIsMonotoneInExponentAboveOne(
        uint128 baseSeed,
        int128 leftExponentSeed,
        int128 rightExponentSeed
    ) public view {
        uint256 base = WAD + uint256(baseSeed) % WAD;
        int256 left = bound(int256(leftExponentSeed), -10e18, 10e18);
        int256 right = bound(int256(rightExponentSeed), -10e18, 10e18);
        (left, right) = left <= right ? (left, right) : (right, left);

        assertLe(math.powWad(base, left), math.powWad(base, right));
    }

    function _assertContainsUnsigned(uint256 lower, uint256 upper, uint256 oracleFloor, uint256 oracleCeiling)
        private
        pure
    {
        assertLe(lower, oracleFloor);
        assertGe(upper, oracleCeiling);
    }

    function _assertLnContains(uint256 input, int256 oracleFloor, int256 oracleCeiling) private view {
        (int256 lower, int256 upper) = math.lnWadBounds(input);
        _assertContainsSigned(lower, upper, oracleFloor, oracleCeiling);
    }

    function _assertExpContains(int256 input, uint256 oracleFloor, uint256 oracleCeiling) private view {
        (uint256 lower, uint256 upper) = math.expWadBounds(input);
        _assertContainsUnsigned(lower, upper, oracleFloor, oracleCeiling);
    }

    function _assertExpm1Contains(int256 input, int256 oracleFloor, int256 oracleCeiling) private view {
        (int256 lower, int256 upper) = math.expm1WadBounds(input);
        _assertContainsSigned(lower, upper, oracleFloor, oracleCeiling);
    }

    function _assertLog1pContains(int256 input, int256 oracleFloor, int256 oracleCeiling) private view {
        (int256 lower, int256 upper) = math.log1pWadBounds(input);
        _assertContainsSigned(lower, upper, oracleFloor, oracleCeiling);
    }

    function _assertPowContains(uint256 base, int256 exponent, uint256 oracleFloor, uint256 oracleCeiling)
        private
        view
    {
        (uint256 lower, uint256 upper) = math.powWadBounds(base, exponent);
        _assertContainsUnsigned(lower, upper, oracleFloor, oracleCeiling);
    }

    function _assertContainsSigned(int256 lower, int256 upper, int256 oracleFloor, int256 oracleCeiling) private pure {
        assertLe(lower, oracleFloor);
        assertGe(upper, oracleCeiling);
    }

    function _assertLnInterval(uint256 input, int256 expectedLower, int256 expectedUpper) private view {
        (int256 lower, int256 upper) = math.lnWadBounds(input);
        assertEq(lower, expectedLower);
        assertEq(upper, expectedUpper);
    }

    function _assertExpInterval(int256 input, uint256 expectedLower, uint256 expectedUpper) private view {
        (uint256 lower, uint256 upper) = math.expWadBounds(input);
        assertEq(lower, expectedLower);
        assertEq(upper, expectedUpper);
    }

    function _assertPowInterval(uint256 base, int256 exponent, uint256 expectedLower, uint256 expectedUpper)
        private
        view
    {
        (uint256 lower, uint256 upper) = math.powWadBounds(base, exponent);
        assertEq(lower, expectedLower);
        assertEq(upper, expectedUpper);
    }
}
