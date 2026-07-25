// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB batch integration tests added on 25 July 2026.

import {Test} from "forge-std/Test.sol";

import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {TokenMock} from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import {
    AlphaWad,
    AmountWad,
    CurveConfig,
    CurveSide,
    PriceWad,
    RateWad,
    UnitlessWad
} from "../../src/types/CurveTypes.sol";
import {PositionConfig, PositionQuote, PositionRuntime} from "../../src/types/PositionTypes.sol";
import {ExactInputRoute, ExactOutputRoute, FillRequest, RouteResult} from "../../src/types/RouteTypes.sol";
import {LiquidOBStalePositionVersion} from "../../src/types/ProtocolErrors.sol";
import {LiquidOBSwapVMRouter} from "../../src/core/LiquidOBSwapVMRouter.sol";
import {LiquidOBBatchExecutor} from "../../src/periphery/LiquidOBBatchExecutor.sol";

contract LiquidOBBatchExecutorTest is Test {
    IAqua private aqua;
    LiquidOBSwapVMRouter private router;
    LiquidOBBatchExecutor private executor;
    TokenMock private base;
    TokenMock private quoteToken;
    address private makerOne;
    address private makerTwo;
    address private payer;
    address private recipient;
    address private refundRecipient;
    ISwapVM.Order private orderOne;
    ISwapVM.Order private orderTwo;
    bytes32 private hashOne;
    bytes32 private hashTwo;

    function setUp() public {
        makerOne = makeAddr("maker-one");
        makerTwo = makeAddr("maker-two");
        payer = makeAddr("payer");
        recipient = makeAddr("recipient");
        refundRecipient = makeAddr("refund-recipient");
        aqua = IAqua(address(new Aqua()));
        router = new LiquidOBSwapVMRouter(address(aqua), address(this));
        executor = new LiquidOBBatchExecutor(address(router), 4);
        base = new TokenMock("Base", "BASE");
        quoteToken = new TokenMock("Quote", "QUOTE");

        (orderOne, hashOne) = _ship(makerOne, 50 ether, 5_000 ether, 100e18, 180e18, 2e18, "one");
        (orderTwo, hashTwo) = _ship(makerTwo, 70 ether, 6_000 ether, 110e18, 220e18, 0, "two");

        base.mint(payer, 100 ether);
        quoteToken.mint(payer, 20_000 ether);
        vm.startPrank(payer);
        base.approve(address(executor), type(uint256).max);
        quoteToken.approve(address(executor), type(uint256).max);
        vm.stopPrank();
    }

    function testExactInputSplitsAcrossTwoMakersAndLeavesNoDust() public {
        FillRequest[] memory fills = new FillRequest[](2);
        fills[0] = _fill(makerOne, hashOne, orderOne, 0, 500 ether);
        fills[1] = _fill(makerTwo, hashTwo, orderTwo, 0, 700 ether);
        uint256 expectedOut = router.previewExactInput(orderOne, CurveSide.Sell, 0, fills[0].amount).curve.amountOut
            + router.previewExactInput(orderTwo, CurveSide.Sell, 0, fills[1].amount).curve.amountOut;
        ExactInputRoute memory route = ExactInputRoute({
            baseToken: address(base),
            quoteToken: address(quoteToken),
            side: CurveSide.Sell,
            salt: keccak256("exact-input"),
            amountIn: 1_200 ether,
            minAmountOut: expectedOut,
            recipient: recipient,
            refundRecipient: refundRecipient,
            deadline: uint40(block.timestamp + 1 hours),
            fills: fills
        });

        vm.prank(payer);
        RouteResult memory result = executor.executeExactInput(route);

        assertEq(result.amountIn, 1_200 ether);
        assertEq(result.amountOut, expectedOut);
        assertEq(result.fillCount, 2);
        assertEq(base.balanceOf(recipient), expectedOut);
        assertEq(quoteToken.balanceOf(payer), 18_800 ether);
        assertEq(base.balanceOf(address(executor)), 0);
        assertEq(quoteToken.balanceOf(address(executor)), 0);
        assertEq(quoteToken.allowance(address(executor), address(router)), 0);
        assertEq(router.storedRuntime(makerOne, hashOne).version, 1);
        assertEq(router.storedRuntime(makerTwo, hashTwo).version, 1);
    }

    function testExactOutputRefundsUnusedMaximumInput() public {
        FillRequest[] memory fills = new FillRequest[](2);
        fills[0] = _fill(makerOne, hashOne, orderOne, 0, 100 ether);
        fills[1] = _fill(makerTwo, hashTwo, orderTwo, 0, 200 ether);
        PositionQuote memory first = router.previewExactOutput(orderOne, CurveSide.Buy, 0, fills[0].amount);
        PositionQuote memory second = router.previewExactOutput(orderTwo, CurveSide.Buy, 0, fills[1].amount);
        uint256 expectedIn = first.curve.amountIn + second.curve.amountIn;
        uint256 maximumIn = expectedIn + 1 ether;
        ExactOutputRoute memory route = ExactOutputRoute({
            baseToken: address(base),
            quoteToken: address(quoteToken),
            side: CurveSide.Buy,
            salt: keccak256("exact-output"),
            amountOut: 300 ether,
            maxAmountIn: maximumIn,
            recipient: recipient,
            refundRecipient: refundRecipient,
            deadline: uint40(block.timestamp + 1 hours),
            fills: fills
        });

        vm.prank(payer);
        RouteResult memory result = executor.executeExactOutput(route);

        assertEq(result.amountIn, expectedIn);
        assertEq(result.amountOut, 300 ether);
        assertEq(quoteToken.balanceOf(recipient), 300 ether);
        assertEq(base.balanceOf(refundRecipient), maximumIn - expectedIn);
        assertEq(base.balanceOf(address(executor)), 0);
        assertEq(base.allowance(address(executor), address(router)), 0);
    }

    function testSecondFillFailureRollsBackFirstFillAndFunding() public {
        FillRequest[] memory fills = new FillRequest[](2);
        fills[0] = _fill(makerOne, hashOne, orderOne, 0, 500 ether);
        fills[1] = _fill(makerTwo, hashTwo, orderTwo, 1, 500 ether);
        ExactInputRoute memory route = ExactInputRoute({
            baseToken: address(base),
            quoteToken: address(quoteToken),
            side: CurveSide.Sell,
            salt: keccak256("rollback"),
            amountIn: 1_000 ether,
            minAmountOut: 0,
            recipient: recipient,
            refundRecipient: refundRecipient,
            deadline: uint40(block.timestamp + 1 hours),
            fills: fills
        });
        uint256 payerBalanceBefore = quoteToken.balanceOf(payer);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(LiquidOBStalePositionVersion.selector, uint64(1), uint64(0)));
        executor.executeExactInput(route);

        PositionRuntime memory firstRuntime = router.storedRuntime(makerOne, hashOne);
        assertFalse(firstRuntime.initialized);
        assertEq(firstRuntime.version, 0);
        assertEq(quoteToken.balanceOf(payer), payerBalanceBefore);
        assertEq(base.balanceOf(recipient), 0);
        assertEq(quoteToken.balanceOf(address(executor)), 0);
    }

    function _ship(
        address maker,
        uint256 baseReserve,
        uint256 quoteReserve,
        uint128 sellStart,
        uint128 sellEnd,
        int128 sellAlpha,
        string memory saltLabel
    ) private returns (ISwapVM.Order memory makerOrder, bytes32 strategyHash) {
        PositionConfig memory position;
        position.baseToken = address(base);
        position.quoteToken = address(quoteToken);
        position.salt = keccak256(bytes(saltLabel));
        // Test reserves are fixed far below uint128.max.
        // forge-lint: disable-next-line(unsafe-typecast)
        position.sell = router.deriveCurve(_curve(sellStart, sellEnd, sellAlpha, uint128(baseReserve)), CurveSide.Sell);
        // Test reserves are fixed far below uint128.max.
        // forge-lint: disable-next-line(unsafe-typecast)
        position.buy = router.deriveCurve(_curve(90e18, 50e18, 0, uint128(quoteReserve)), CurveSide.Buy);
        makerOrder = router.buildOrder(maker, position);

        base.mint(maker, baseReserve);
        quoteToken.mint(maker, quoteReserve);
        vm.startPrank(maker);
        base.approve(address(aqua), type(uint256).max);
        quoteToken.approve(address(aqua), type(uint256).max);
        strategyHash =
            aqua.ship(address(router), abi.encode(makerOrder), _tokens(), _allocations(baseReserve, quoteReserve));
        vm.stopPrank();
    }

    function _fill(
        address maker,
        bytes32 strategyHash,
        ISwapVM.Order storage makerOrder,
        uint64 version,
        uint256 amount
    ) private pure returns (FillRequest memory) {
        return FillRequest({
            maker: maker,
            strategyHash: strategyHash,
            expectedVersion: version,
            amount: amount,
            strategy: abi.encode(makerOrder)
        });
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

    function _tokens() private view returns (address[] memory tokens) {
        tokens = new address[](2);
        tokens[0] = address(base);
        tokens[1] = address(quoteToken);
    }

    function _allocations(uint256 baseReserve, uint256 quoteReserve) private pure returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = baseReserve;
        amounts[1] = quoteReserve;
    }
}
