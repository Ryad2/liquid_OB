// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {Test} from "forge-std/Test.sol";

import {
    AlphaWad,
    AmountWad,
    CurveBranch,
    CurveConfig,
    CurveQuote,
    CurveSide,
    CurveState,
    NativeCurve,
    PriceWad,
    RateWad,
    UnitlessWad
} from "../../src/types/CurveTypes.sol";
import {PositionConfig, PositionRuntime} from "../../src/types/PositionTypes.sol";
import {CurveCompiler} from "../../src/libraries/CurveCompiler.sol";
import {CurveMath} from "../../src/libraries/CurveMath.sol";
import {PositionMath} from "../../src/libraries/PositionMath.sol";

contract CurveKernelHarness {
    function derive(CurveConfig calldata config, CurveSide side) external pure returns (CurveConfig memory) {
        return CurveCompiler.derive(config, side);
    }

    function compile(CurveConfig calldata config, CurveSide side) external pure returns (NativeCurve memory) {
        return CurveCompiler.compile(config, side);
    }

    function marginalRate(NativeCurve calldata curve, CurveState calldata state) external pure returns (RateWad) {
        return CurveMath.marginalRate(curve, state);
    }

    function quoteExactInput(NativeCurve calldata curve, CurveState calldata state, CurveSide side, AmountWad amountIn)
        external
        pure
        returns (CurveQuote memory)
    {
        return CurveMath.quoteExactInput(curve, state, side, amountIn);
    }

    function quoteExactOutput(
        NativeCurve calldata curve,
        CurveState calldata state,
        CurveSide side,
        AmountWad amountOut
    ) external pure returns (CurveQuote memory) {
        return CurveMath.quoteExactOutput(curve, state, side, amountOut);
    }

    function initial(PositionConfig calldata config) external pure returns (PositionRuntime memory) {
        return PositionMath.initial(config);
    }

    function transition(PositionRuntime calldata beforeState, CurveSide side, CurveQuote calldata quote)
        external
        pure
        returns (PositionRuntime memory)
    {
        return PositionMath.transition(beforeState, side, quote);
    }
}

contract CurveKernelTest is Test {
    uint256 private constant WAD = 1e18;
    address private constant BASE = 0x1111111111111111111111111111111111111111;
    address private constant QUOTE = 0x2222222222222222222222222222222222222222;

    CurveKernelHarness private kernel;

    function setUp() public {
        kernel = new CurveKernelHarness();
    }

    function testCompilerCoversGeneralAndSingularBranches() public view {
        int128[5] memory alphas = [int128(2e18), int128(1e18), int128(0.5e18), int128(0), int128(-2e18)];
        CurveBranch[5] memory expected = [
            CurveBranch.General,
            CurveBranch.NativeAlphaOne,
            CurveBranch.General,
            CurveBranch.NativeAlphaZero,
            CurveBranch.General
        ];

        for (uint256 i; i < alphas.length; ++i) {
            CurveConfig memory config = kernel.derive(_curve(200e18, 100e18, alphas[i], 1000e18), CurveSide.Buy);
            NativeCurve memory curve = kernel.compile(config, CurveSide.Buy);
            CurveState memory fresh = CurveState({y: AmountWad.wrap(1000e18), yInt: AmountWad.wrap(1000e18)});
            CurveState memory terminal = CurveState({y: AmountWad.wrap(0), yInt: AmountWad.wrap(1000e18)});

            assertEq(uint8(curve.branch), uint8(expected[i]));
            assertApproxEqAbs(RateWad.unwrap(kernel.marginalRate(curve, fresh)), 200e18, 2e7);
            assertApproxEqAbs(RateWad.unwrap(kernel.marginalRate(curve, terminal)), 100e18, 2e7);
        }
    }

    function testExactInputAndOutputAgreeOnRepresentativeCurve() public view {
        CurveConfig memory config = kernel.derive(_curve(200e18, 100e18, 2e18, 1000e18), CurveSide.Buy);
        NativeCurve memory curve = kernel.compile(config, CurveSide.Buy);
        CurveState memory state = CurveState({y: AmountWad.wrap(1000e18), yInt: AmountWad.wrap(1000e18)});

        CurveQuote memory exactOutput = kernel.quoteExactOutput(curve, state, CurveSide.Buy, AmountWad.wrap(100e18));
        CurveQuote memory exactInput = kernel.quoteExactInput(curve, state, CurveSide.Buy, exactOutput.amountInWad);

        assertApproxEqAbs(AmountWad.unwrap(exactInput.amountOutWad), 100e18, 2e8);
        assertLe(PriceWad.unwrap(exactOutput.displayedPriceAfter), PriceWad.unwrap(exactOutput.displayedPriceBefore));
        assertGe(PriceWad.unwrap(exactOutput.displayedEffectivePrice), PriceWad.unwrap(exactOutput.displayedPriceAfter));
    }

    function testFlatCurveBehavesLikeOneOrderBookLevel() public view {
        CurveConfig memory config = kernel.derive(_curve(125e18, 125e18, 7e18, 100e18), CurveSide.Buy);
        NativeCurve memory curve = kernel.compile(config, CurveSide.Buy);
        CurveState memory state = CurveState({y: AmountWad.wrap(100e18), yInt: AmountWad.wrap(100e18)});
        CurveQuote memory quote = kernel.quoteExactInput(curve, state, CurveSide.Buy, AmountWad.wrap(0.2e18));

        assertEq(uint8(curve.branch), uint8(CurveBranch.Flat));
        assertEq(AmountWad.unwrap(quote.amountOutWad), 25e18);
        assertEq(PriceWad.unwrap(quote.displayedEffectivePrice), 125e18);
    }

    function testSellCurveUsesDisplayedQuotePerBaseOrientation() public view {
        CurveConfig memory config = kernel.derive(_curve(100e18, 200e18, 2e18, 50e18), CurveSide.Sell);
        NativeCurve memory curve = kernel.compile(config, CurveSide.Sell);
        CurveState memory state = CurveState({y: AmountWad.wrap(50e18), yInt: AmountWad.wrap(50e18)});
        CurveQuote memory quote = kernel.quoteExactOutput(curve, state, CurveSide.Sell, AmountWad.wrap(5e18));

        assertApproxEqAbs(PriceWad.unwrap(quote.displayedPriceBefore), 100e18, 2e7);
        assertGt(PriceWad.unwrap(quote.displayedPriceAfter), PriceWad.unwrap(quote.displayedPriceBefore));
        assertGt(quote.amountIn, 500e18);
    }

    function testFillRecyclesIncomingInventoryAndPreservesOppositeProgress() public view {
        PositionConfig memory config = PositionConfig({
            baseToken: BASE,
            quoteToken: QUOTE,
            salt: bytes32(uint256(1)),
            sell: kernel.derive(_curve(100e18, 200e18, 2e18, 50e18), CurveSide.Sell),
            buy: kernel.derive(_curve(90e18, 50e18, 0, 1000e18), CurveSide.Buy)
        });
        PositionRuntime memory runtime = kernel.initial(config);
        runtime.buy = CurveState({y: AmountWad.wrap(500e18), yInt: AmountWad.wrap(1000e18)});

        NativeCurve memory sellCurve = kernel.compile(config.sell, CurveSide.Sell);
        CurveQuote memory quote = kernel.quoteExactOutput(sellCurve, runtime.sell, CurveSide.Sell, AmountWad.wrap(5e18));
        PositionRuntime memory afterState = kernel.transition(runtime, CurveSide.Sell, quote);

        assertEq(afterState.version, 1);
        assertTrue(afterState.initialized);
        assertEq(AmountWad.unwrap(afterState.sell.y), 45e18);
        assertEq(AmountWad.unwrap(afterState.buy.y), 500e18 + quote.amountIn);
        assertApproxEqAbs(AmountWad.unwrap(afterState.buy.y) * WAD / AmountWad.unwrap(afterState.buy.yInt), 0.5e18, 1);
    }

    function _curve(uint128 start, uint128 end, int128 alpha, uint128 reserve)
        private
        pure
        returns (CurveConfig memory)
    {
        return CurveConfig({
            startPrice: PriceWad.wrap(start),
            endPrice: PriceWad.wrap(end),
            alpha: AlphaWad.wrap(alpha),
            initialReserve: AmountWad.wrap(reserve),
            mu: UnitlessWad.wrap(start == end ? 0 : 1),
            kappa: RateWad.wrap(1)
        });
    }
}
