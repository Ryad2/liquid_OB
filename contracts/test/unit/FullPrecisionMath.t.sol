// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {AmountWad, Rounding} from "../../src/types/CurveTypes.sol";
import {
    LiquidOBAmountOverflow,
    LiquidOBMathDivisionByZero,
    LiquidOBMathOverflow,
    LiquidOBMathUnderflow,
    LiquidOBNegativeToUnsigned,
    LiquidOBUnsupportedTokenDecimals
} from "../../src/types/ProtocolErrors.sol";
import {FullPrecisionMath} from "../../src/libraries/FullPrecisionMath.sol";

contract FullPrecisionMathHarness {
    function mulDiv(uint256 x, uint256 y, uint256 denominator, Rounding rounding) external pure returns (uint256) {
        return FullPrecisionMath.mulDiv(x, y, denominator, rounding);
    }

    function div(uint256 numerator, uint256 denominator, Rounding rounding) external pure returns (uint256) {
        return FullPrecisionMath.div(numerator, denominator, rounding);
    }

    function mulWad(uint256 xWad, uint256 yWad, Rounding rounding) external pure returns (uint256) {
        return FullPrecisionMath.mulWad(xWad, yWad, rounding);
    }

    function divWad(uint256 xWad, uint256 yWad, Rounding rounding) external pure returns (uint256) {
        return FullPrecisionMath.divWad(xWad, yWad, rounding);
    }

    function reciprocalWad(uint256 valueWad, Rounding rounding) external pure returns (uint256) {
        return FullPrecisionMath.reciprocalWad(valueWad, rounding);
    }

    function mulDivSigned(int256 x, int256 y, int256 denominator, Rounding rounding) external pure returns (int256) {
        return FullPrecisionMath.mulDivSigned(x, y, denominator, rounding);
    }

    function mulWadSigned(int256 xWad, int256 yWad, Rounding rounding) external pure returns (int256) {
        return FullPrecisionMath.mulWadSigned(xWad, yWad, rounding);
    }

    function divWadSigned(int256 xWad, int256 yWad, Rounding rounding) external pure returns (int256) {
        return FullPrecisionMath.divWadSigned(xWad, yWad, rounding);
    }

    function abs(int256 value) external pure returns (uint256) {
        return FullPrecisionMath.abs(value);
    }

    function toInt256(uint256 value) external pure returns (int256) {
        return FullPrecisionMath.toInt256(value);
    }

    function toUint256(int256 value) external pure returns (uint256) {
        return FullPrecisionMath.toUint256(value);
    }

    function toAmountWad(uint256 value) external pure returns (uint128) {
        return AmountWad.unwrap(FullPrecisionMath.toAmountWad(value));
    }

    function rawToWad(address token, uint256 rawAmount, uint8 tokenDecimals) external pure returns (uint128) {
        return AmountWad.unwrap(FullPrecisionMath.rawToWad(token, rawAmount, tokenDecimals));
    }

    function wadToRaw(address token, uint128 amountWad, uint8 tokenDecimals, Rounding rounding)
        external
        pure
        returns (uint256)
    {
        return FullPrecisionMath.wadToRaw(token, AmountWad.wrap(amountWad), tokenDecimals, rounding);
    }

    function addAmount(uint128 left, uint128 right) external pure returns (uint128) {
        return AmountWad.unwrap(FullPrecisionMath.addAmount(AmountWad.wrap(left), AmountWad.wrap(right)));
    }

    function subAmount(uint128 left, uint128 right) external pure returns (uint128) {
        return AmountWad.unwrap(FullPrecisionMath.subAmount(AmountWad.wrap(left), AmountWad.wrap(right)));
    }

    function scaleAmount(uint128 amount, uint128 numerator, uint128 denominator, Rounding rounding)
        external
        pure
        returns (uint128)
    {
        return AmountWad.unwrap(
            FullPrecisionMath.scaleAmount(
                AmountWad.wrap(amount), AmountWad.wrap(numerator), AmountWad.wrap(denominator), rounding
            )
        );
    }
}

contract FullPrecisionMathTest is Test {
    uint256 private constant WAD = 1e18;
    uint128 private constant WAD_128 = 1e18;
    uint128 private constant WAD_PLUS_ONE_128 = 1e18 + 1;
    address private constant TOKEN = 0x1111111111111111111111111111111111111111;

    FullPrecisionMathHarness private math;

    function setUp() public {
        math = new FullPrecisionMathHarness();
    }

    function testMulDivUsesExplicitUnsignedFloorAndCeiling() public view {
        assertEq(math.mulDiv(10, 10, 6, Rounding.Down), 16);
        assertEq(math.mulDiv(10, 10, 6, Rounding.Up), 17);
        assertEq(math.mulDiv(10, 10, 5, Rounding.Down), 20);
        assertEq(math.mulDiv(10, 10, 5, Rounding.Up), 20);
    }

    function testMulDivPreservesHighProductBits() public view {
        uint256 x = uint256(1) << 200;
        uint256 y = uint256(1) << 100;
        uint256 denominator = uint256(1) << 100;

        assertEq(math.mulDiv(x, y, denominator, Rounding.Down), x);
        assertEq(math.mulDiv(x, y, denominator, Rounding.Up), x);
    }

    function testMulDivMatchesCommittedReferenceRoundingInterval() public view {
        uint256 decimalNumerator = 909762010458269005673486271226292471;
        uint256 decimalScale = 1e36;

        assertEq(math.mulDiv(decimalNumerator, WAD, decimalScale, Rounding.Down), 909762010458269005);
        assertEq(math.mulDiv(decimalNumerator, WAD, decimalScale, Rounding.Up), 909762010458269006);
    }

    function testMulDivRejectsZeroDenominatorAndOverflow() public {
        vm.expectRevert(LiquidOBMathDivisionByZero.selector);
        math.mulDiv(1, 1, 0, Rounding.Down);

        vm.expectRevert(LiquidOBMathOverflow.selector);
        math.mulDiv(type(uint256).max, type(uint256).max, 1, Rounding.Down);
    }

    function testMulDivRejectsCeilingPastUint256Maximum() public {
        uint256 x = type(uint256).max - 1;
        uint256 denominator = type(uint256).max - 2;

        assertEq(math.mulDiv(x, x, denominator, Rounding.Down), type(uint256).max);
        vm.expectRevert(LiquidOBMathOverflow.selector);
        math.mulDiv(x, x, denominator, Rounding.Up);
    }

    function testUnsignedWadPrimitivesPreserveDirection() public view {
        assertEq(math.mulWad(1, 1, Rounding.Down), 0);
        assertEq(math.mulWad(1, 1, Rounding.Up), 1);
        assertEq(math.mulWad(1.5e18, 2.5e18, Rounding.Down), 3.75e18);

        assertEq(math.divWad(WAD, 3e18, Rounding.Down), 333333333333333333);
        assertEq(math.divWad(WAD, 3e18, Rounding.Up), 333333333333333334);
        assertEq(math.reciprocalWad(3e18, Rounding.Down), 333333333333333333);
        assertEq(math.reciprocalWad(3e18, Rounding.Up), 333333333333333334);
    }

    function testSignedMulDivUsesMathematicalFloorAndCeiling() public view {
        assertEq(math.mulDivSigned(10, -10, 6, Rounding.Down), -17);
        assertEq(math.mulDivSigned(10, -10, 6, Rounding.Up), -16);
        assertEq(math.mulDivSigned(-10, -10, 6, Rounding.Down), 16);
        assertEq(math.mulDivSigned(-10, -10, 6, Rounding.Up), 17);
        assertEq(math.mulDivSigned(10, 10, -6, Rounding.Down), -17);
        assertEq(math.mulDivSigned(10, 10, -6, Rounding.Up), -16);
        assertEq(math.mulDivSigned(10, -10, 5, Rounding.Down), -20);
        assertEq(math.mulDivSigned(10, -10, 5, Rounding.Up), -20);
    }

    function testSignedWadPrimitivesPreserveDirection() public view {
        assertEq(math.mulWadSigned(-1, 1, Rounding.Down), -1);
        assertEq(math.mulWadSigned(-1, 1, Rounding.Up), 0);
        assertEq(math.divWadSigned(-1e18, 3e18, Rounding.Down), -333333333333333334);
        assertEq(math.divWadSigned(-1e18, 3e18, Rounding.Up), -333333333333333333);
    }

    function testSignedMulDivPreservesHighProductBits() public view {
        int256 x = int256(1) << 200;
        int256 y = int256(1) << 100;
        int256 denominator = int256(1) << 100;

        assertEq(math.mulDivSigned(x, y, denominator, Rounding.Down), x);
        assertEq(math.mulDivSigned(x, y, denominator, Rounding.Up), x);
    }

    function testSignedBoundariesAndConversions() public {
        assertEq(math.abs(type(int256).min), uint256(1) << 255);
        assertEq(math.mulDivSigned(type(int256).min, 1, 1, Rounding.Down), type(int256).min);
        assertEq(math.toInt256(uint256(type(int256).max)), type(int256).max);
        assertEq(math.toUint256(type(int256).max), uint256(type(int256).max));

        vm.expectRevert(LiquidOBMathOverflow.selector);
        math.mulDivSigned(type(int256).min, -1, 1, Rounding.Down);

        vm.expectRevert(LiquidOBMathOverflow.selector);
        math.mulDivSigned(type(int256).min, 2, 1, Rounding.Down);

        vm.expectRevert(LiquidOBMathOverflow.selector);
        math.toInt256(uint256(type(int256).max) + 1);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBNegativeToUnsigned.selector, int256(-1)));
        math.toUint256(-1);
    }

    function testSignedMulDivRejectsZeroDenominator() public {
        vm.expectRevert(LiquidOBMathDivisionByZero.selector);
        math.mulDivSigned(1, 1, 0, Rounding.Down);
    }

    function testRawAndWadConversionsRespectTokenDecimalsAndRounding() public view {
        assertEq(math.rawToWad(TOKEN, 1_000_000, 6), WAD_128);
        assertEq(math.rawToWad(TOKEN, WAD, 18), WAD_128);

        assertEq(math.wadToRaw(TOKEN, WAD_PLUS_ONE_128, 6, Rounding.Down), 1_000_000);
        assertEq(math.wadToRaw(TOKEN, WAD_PLUS_ONE_128, 6, Rounding.Up), 1_000_001);
        assertEq(math.wadToRaw(TOKEN, WAD_PLUS_ONE_128, 18, Rounding.Down), WAD + 1);
    }

    function testRawToWadRejectsUnsupportedDecimalsAndUint128Overflow() public {
        assertEq(math.toAmountWad(type(uint128).max), type(uint128).max);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBUnsupportedTokenDecimals.selector, TOKEN, uint8(19)));
        math.rawToWad(TOKEN, 1, 19);

        uint256 maxRawAtZeroDecimals = uint256(type(uint128).max) / WAD;
        vm.expectRevert(abi.encodeWithSelector(LiquidOBAmountOverflow.selector, maxRawAtZeroDecimals + 1));
        math.rawToWad(TOKEN, maxRawAtZeroDecimals + 1, 0);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBAmountOverflow.selector, uint256(type(uint128).max) + 1));
        math.toAmountWad(uint256(type(uint128).max) + 1);
    }

    function testReserveAdditionSubtractionAndScalingAreChecked() public {
        assertEq(math.addAmount(5e18, 7e18), 12e18);
        assertEq(math.subAmount(12e18, 7e18), 5e18);
        assertEq(math.scaleAmount(5, 7, 3, Rounding.Down), 11);
        assertEq(math.scaleAmount(5, 7, 3, Rounding.Up), 12);

        uint256 overflowingSum = uint256(type(uint128).max) + 1;
        vm.expectRevert(abi.encodeWithSelector(LiquidOBAmountOverflow.selector, overflowingSum));
        math.addAmount(type(uint128).max, 1);

        vm.expectRevert(LiquidOBMathUnderflow.selector);
        math.subAmount(1, 2);

        vm.expectRevert(LiquidOBMathDivisionByZero.selector);
        math.scaleAmount(1, 1, 0, Rounding.Down);

        uint256 overflowingScale = uint256(type(uint128).max) * uint256(type(uint128).max);
        vm.expectRevert(abi.encodeWithSelector(LiquidOBAmountOverflow.selector, overflowingScale));
        math.scaleAmount(type(uint128).max, type(uint128).max, 1, Rounding.Down);
    }

    function testFuzzMulDivMatchesBoundedExactArithmetic(uint128 x, uint128 y, uint128 denominatorSeed) public view {
        uint256 denominator = uint256(denominatorSeed) + 1;
        uint256 product = uint256(x) * uint256(y);
        uint256 floorResult = product / denominator;
        uint256 ceilingResult = floorResult + (product % denominator == 0 ? 0 : 1);

        assertEq(math.mulDiv(x, y, denominator, Rounding.Down), floorResult);
        assertEq(math.mulDiv(x, y, denominator, Rounding.Up), ceilingResult);
    }

    function testFuzzSignedMulDivMatchesSolidityWithDirectedCorrection(int128 x, int128 y, int128 denominatorSeed)
        public
        view
    {
        int256 denominator = denominatorSeed == 0 ? int256(1) : int256(denominatorSeed);
        int256 numerator = int256(x) * int256(y);
        int256 truncated = numerator / denominator;
        int256 remainder = numerator % denominator;
        bool negative = (numerator < 0) != (denominator < 0);
        int256 floorResult = truncated - (remainder != 0 && negative ? int256(1) : int256(0));
        int256 ceilingResult = truncated + (remainder != 0 && !negative ? int256(1) : int256(0));

        assertEq(math.mulDivSigned(x, y, denominator, Rounding.Down), floorResult);
        assertEq(math.mulDivSigned(x, y, denominator, Rounding.Up), ceilingResult);
    }

    function testFuzzRawWadRoundTripIsExact(uint256 rawSeed, uint8 decimalsSeed) public view {
        uint8 tokenDecimals = decimalsSeed % 19;
        uint256 factor = 10 ** (18 - tokenDecimals);
        uint256 maxRaw = uint256(type(uint128).max) / factor;
        uint256 rawAmount = rawSeed % (maxRaw + 1);
        uint128 amountWad = math.rawToWad(TOKEN, rawAmount, tokenDecimals);

        assertEq(math.wadToRaw(TOKEN, amountWad, tokenDecimals, Rounding.Down), rawAmount);
        assertEq(math.wadToRaw(TOKEN, amountWad, tokenDecimals, Rounding.Up), rawAmount);
    }
}
