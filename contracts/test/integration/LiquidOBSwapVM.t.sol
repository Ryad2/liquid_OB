// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB integration tests added on 25 July 2026.

import {Test} from "forge-std/Test.sol";

import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {TokenMock} from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {TakerTraitsLib} from "@1inch/swap-vm/src/libs/TakerTraits.sol";

import {
    AlphaWad,
    AmountWad,
    CurveConfig,
    CurveSide,
    PriceWad,
    RateWad,
    UnitlessWad
} from "../../src/types/CurveTypes.sol";
import {
    PositionConfig,
    PositionLocator,
    PositionQuote,
    PositionRuntime,
    QuoteParams
} from "../../src/types/PositionTypes.sol";
import {LiquidOBSwapVMRouter} from "../../src/core/LiquidOBSwapVMRouter.sol";
import {LiquidOBQuoter} from "../../src/periphery/LiquidOBQuoter.sol";

contract LiquidOBSwapVMTest is Test {
    IAqua private aqua;
    LiquidOBSwapVMRouter private router;
    LiquidOBQuoter private quoter;
    TokenMock private base;
    TokenMock private quoteToken;
    address private maker;
    address private taker;
    PositionConfig private config;
    ISwapVM.Order private order;
    bytes32 private strategyHash;

    function setUp() public {
        maker = makeAddr("maker");
        taker = makeAddr("taker");
        aqua = IAqua(address(new Aqua()));
        router = new LiquidOBSwapVMRouter(address(aqua), address(this));
        quoter = new LiquidOBQuoter(address(router));
        base = new TokenMock("Base", "BASE");
        quoteToken = new TokenMock("Quote", "QUOTE");

        config = _position();
        order = router.buildOrder(maker, config);
        bytes memory encodedOrder = abi.encode(order);

        base.mint(maker, 50 ether);
        quoteToken.mint(maker, 5_000 ether);
        base.mint(taker, 100 ether);
        quoteToken.mint(taker, 10_000 ether);

        vm.startPrank(maker);
        base.approve(address(aqua), type(uint256).max);
        quoteToken.approve(address(aqua), type(uint256).max);
        strategyHash = aqua.ship(address(router), encodedOrder, _tokens(), _allocations());
        vm.stopPrank();

        vm.startPrank(taker);
        base.approve(address(router), type(uint256).max);
        quoteToken.approve(address(router), type(uint256).max);
        vm.stopPrank();

        assertEq(strategyHash, router.hash(order));
    }

    function testQuoteDoesNotMutateAndProductQuoterMatchesSwapVM() public {
        uint256 amountIn = 1_000 ether;
        bytes memory takerTraits = _takerTraits(true, 0, 0);

        vm.prank(taker);
        (uint256 vmAmountIn, uint256 vmAmountOut, bytes32 quotedHash) =
            ISwapVM(address(router)).quote(order, address(quoteToken), address(base), amountIn, takerTraits);
        PositionQuote memory productQuote = quoter.quoteExactInput(_params(CurveSide.Sell, 0, amountIn));
        PositionRuntime memory stored = router.storedRuntime(maker, strategyHash);

        assertEq(quotedHash, strategyHash);
        assertEq(vmAmountIn, amountIn);
        assertEq(vmAmountOut, productQuote.curve.amountOut);
        assertEq(productQuote.beforeState.version, 0);
        assertEq(productQuote.afterState.version, 1);
        assertFalse(productQuote.beforeState.initialized);
        assertTrue(productQuote.afterState.initialized);
        assertEq(stored.version, 0);
        assertFalse(stored.initialized);
    }

    function testTwoSidedExactInputThenExactOutputSettlesAndRecycles() public {
        uint256 firstInput = 1_000 ether;
        PositionQuote memory firstPreview = quoter.quoteExactInput(_params(CurveSide.Sell, 0, firstInput));

        vm.prank(taker);
        (uint256 firstAmountIn, uint256 firstAmountOut,) = router.swap(
            order, address(quoteToken), address(base), firstInput, _takerTraits(true, firstPreview.curve.amountOut, 0)
        );

        PositionRuntime memory afterSell = router.storedRuntime(maker, strategyHash);
        assertEq(firstAmountIn, firstInput);
        assertEq(firstAmountOut, firstPreview.curve.amountOut);
        assertEq(afterSell.version, 1);
        assertEq(AmountWad.unwrap(afterSell.sell.y), 50 ether - firstAmountOut);
        assertEq(AmountWad.unwrap(afterSell.buy.y), 5_000 ether + firstInput);
        assertEq(AmountWad.unwrap(afterSell.buy.yInt), 5_000 ether + firstInput);

        uint256 requestedQuote = 100 ether;
        PositionQuote memory secondPreview = quoter.quoteExactOutput(_params(CurveSide.Buy, 1, requestedQuote));
        vm.prank(taker);
        (uint256 secondAmountIn, uint256 secondAmountOut,) = router.swap(
            order,
            address(base),
            address(quoteToken),
            requestedQuote,
            _takerTraits(false, secondPreview.curve.amountIn, 1)
        );

        PositionRuntime memory afterBuy = router.storedRuntime(maker, strategyHash);
        assertEq(secondAmountIn, secondPreview.curve.amountIn);
        assertEq(secondAmountOut, requestedQuote);
        assertEq(afterBuy.version, 2);
        assertEq(AmountWad.unwrap(afterBuy.buy.y), AmountWad.unwrap(afterSell.buy.y) - requestedQuote);
        assertEq(AmountWad.unwrap(afterBuy.sell.y), AmountWad.unwrap(afterSell.sell.y) + secondAmountIn);

        assertEq(base.balanceOf(taker), 100 ether + firstAmountOut - secondAmountIn);
        assertEq(quoteToken.balanceOf(taker), 10_000 ether - firstInput + requestedQuote);
        assertEq(base.balanceOf(address(aqua)), 0);
        assertEq(quoteToken.balanceOf(address(aqua)), 0);
        assertEq(base.balanceOf(address(router)), 0);
        assertEq(quoteToken.balanceOf(address(router)), 0);
    }

    function _position() private view returns (PositionConfig memory position) {
        position.baseToken = address(base);
        position.quoteToken = address(quoteToken);
        position.salt = keccak256("liquid-ob-live-position");
        position.sell = router.deriveCurve(_curve(100e18, 200e18, 2e18, 50e18), CurveSide.Sell);
        position.buy = router.deriveCurve(_curve(90e18, 50e18, 0, 5_000e18), CurveSide.Buy);
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

    function _params(CurveSide side, uint64 version, uint256 amount) private view returns (QuoteParams memory) {
        return QuoteParams({
            position: PositionLocator({maker: maker, strategyHash: strategyHash, strategy: abi.encode(order)}),
            side: side,
            expectedVersion: version,
            amount: amount
        });
    }

    function _takerTraits(bool exactInput, uint256 threshold, uint64 version) private view returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: exactInput,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true,
                threshold: abi.encode(threshold),
                to: taker,
                deadline: uint40(block.timestamp + 1 days),
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: abi.encodePacked(version),
                signature: ""
            })
        );
    }

    function _tokens() private view returns (address[] memory tokens) {
        tokens = new address[](2);
        tokens[0] = address(base);
        tokens[1] = address(quoteToken);
    }

    function _allocations() private pure returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = 50 ether;
        amounts[1] = 5_000 ether;
    }
}
