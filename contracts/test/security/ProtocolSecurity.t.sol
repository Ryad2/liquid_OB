// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB adversarial route tests added on 25 July 2026.

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
import {PositionConfig, PositionRuntime} from "../../src/types/PositionTypes.sol";
import {ExactInputRoute, FillRequest} from "../../src/types/RouteTypes.sol";
import {
    LiquidOBDeadlineExpired,
    LiquidOBDuplicatePosition,
    LiquidOBInsufficientAquaBalance,
    LiquidOBSlippageExceeded,
    LiquidOBStrategyHashMismatch,
    LiquidOBTooManyFills
} from "../../src/types/ProtocolErrors.sol";
import {PositionCodec} from "../../src/libraries/PositionCodec.sol";
import {LiquidOBSwapVMRouter} from "../../src/core/LiquidOBSwapVMRouter.sol";
import {LiquidOBBatchExecutor} from "../../src/periphery/LiquidOBBatchExecutor.sol";

contract ProtocolSecurityTest is Test {
    IAqua private aqua;
    LiquidOBSwapVMRouter private router;
    LiquidOBBatchExecutor private executor;
    TokenMock private base;
    TokenMock private quoteToken;
    address private maker;
    address private payer;
    address private recipient;
    ISwapVM.Order private order;
    bytes32 private strategyHash;

    function setUp() public {
        maker = makeAddr("maker");
        payer = makeAddr("payer");
        recipient = makeAddr("recipient");
        aqua = IAqua(address(new Aqua()));
        router = new LiquidOBSwapVMRouter(address(aqua), address(this));
        executor = new LiquidOBBatchExecutor(address(router), 4);
        base = new TokenMock("Base", "BASE");
        quoteToken = new TokenMock("Quote", "QUOTE");

        (order, strategyHash) = _ship(maker, keccak256("primary"), 50 ether);
        quoteToken.mint(payer, 20_000 ether);
        vm.prank(payer);
        quoteToken.approve(address(executor), type(uint256).max);
    }

    function testExpiredRouteIsRejectedBeforeFunding() public {
        vm.warp(1_000);
        uint40 deadline = 999;
        ExactInputRoute memory route =
            _exactInputRoute(_singleFill(_fill(maker, strategyHash, order, 500 ether)), 500 ether, 0, deadline);
        uint256 payerBefore = quoteToken.balanceOf(payer);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(LiquidOBDeadlineExpired.selector, deadline, block.timestamp));
        executor.executeExactInput(route);

        assertEq(quoteToken.balanceOf(payer), payerBefore);
        assertEq(quoteToken.balanceOf(address(executor)), 0);
    }

    function testDuplicatePositionCannotAppearTwiceInOneRoute() public {
        FillRequest[] memory fills = new FillRequest[](2);
        fills[0] = _fill(maker, strategyHash, order, 500 ether);
        fills[1] = _fill(maker, strategyHash, order, 500 ether);
        ExactInputRoute memory route = _exactInputRoute(fills, 1_000 ether, 0, uint40(block.timestamp + 1 hours));

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(LiquidOBDuplicatePosition.selector, PositionCodec.positionKey(maker, strategyHash))
        );
        executor.executeExactInput(route);
    }

    function testConfiguredFillBoundIsEnforcedBeforeFunding() public {
        LiquidOBBatchExecutor boundedExecutor = new LiquidOBBatchExecutor(address(router), 1);
        FillRequest[] memory fills = new FillRequest[](2);
        fills[0] = _fill(maker, strategyHash, order, 500 ether);
        fills[1] = _fill(maker, strategyHash, order, 500 ether);
        ExactInputRoute memory route = _exactInputRoute(fills, 1_000 ether, 0, uint40(block.timestamp + 1 hours));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(LiquidOBTooManyFills.selector, uint256(2), uint256(1)));
        boundedExecutor.executeExactInput(route);
    }

    function testTamperedStrategyHashIsRejected() public {
        bytes32 forgedHash = bytes32(uint256(strategyHash) ^ 1);
        FillRequest memory fill = _fill(maker, forgedHash, order, 500 ether);
        ExactInputRoute memory route =
            _exactInputRoute(_singleFill(fill), 500 ether, 0, uint40(block.timestamp + 1 hours));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(LiquidOBStrategyHashMismatch.selector, forgedHash, strategyHash));
        executor.executeExactInput(route);
    }

    function testAggregateSlippageFailureRollsBackFillAndFunding() public {
        uint256 amountIn = 1_000 ether;
        uint256 quotedOut = router.previewExactInput(order, CurveSide.Sell, 0, amountIn).curve.amountOut;
        ExactInputRoute memory route = _exactInputRoute(
            _singleFill(_fill(maker, strategyHash, order, amountIn)),
            amountIn,
            quotedOut + 1,
            uint40(block.timestamp + 1 hours)
        );
        uint256 payerBefore = quoteToken.balanceOf(payer);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(LiquidOBSlippageExceeded.selector, quotedOut, quotedOut + 1));
        executor.executeExactInput(route);

        PositionRuntime memory runtime = router.storedRuntime(maker, strategyHash);
        assertFalse(runtime.initialized);
        assertEq(runtime.version, 0);
        assertEq(quoteToken.balanceOf(payer), payerBefore);
        assertEq(base.balanceOf(recipient), 0);
        assertEq(quoteToken.balanceOf(address(executor)), 0);
    }

    function testDockedPositionCannotSettle() public {
        vm.prank(maker);
        aqua.dock(address(router), strategyHash, _tokens());
        ExactInputRoute memory route = _exactInputRoute(
            _singleFill(_fill(maker, strategyHash, order, 500 ether)), 500 ether, 0, uint40(block.timestamp + 1 hours)
        );

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(
                IAqua.SafeBalancesForTokenNotInActiveStrategy.selector,
                maker,
                address(router),
                strategyHash,
                address(quoteToken)
            )
        );
        executor.executeExactInput(route);
    }

    function testLogicalReserveCannotBypassAquaAllocation() public {
        uint256 expectedOutput = router.previewExactInput(order, CurveSide.Sell, 0, 1_000 ether).curve.amountOut;
        address underfundedMaker = makeAddr("underfunded-maker");
        (ISwapVM.Order memory underfundedOrder, bytes32 underfundedHash) =
            _ship(underfundedMaker, keccak256("underfunded"), 1);
        ExactInputRoute memory route = _exactInputRoute(
            _singleFill(_fill(underfundedMaker, underfundedHash, underfundedOrder, 1_000 ether)),
            1_000 ether,
            0,
            uint40(block.timestamp + 1 hours)
        );

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(LiquidOBInsufficientAquaBalance.selector, expectedOutput, uint256(1)));
        executor.executeExactInput(route);
    }

    function _ship(address positionMaker, bytes32 salt, uint256 baseAllocation)
        private
        returns (ISwapVM.Order memory makerOrder, bytes32 hash)
    {
        PositionConfig memory position;
        position.baseToken = address(base);
        position.quoteToken = address(quoteToken);
        position.salt = salt;
        position.sell = router.deriveCurve(_curve(100e18, 180e18, 2e18, 50e18), CurveSide.Sell);
        position.buy = router.deriveCurve(_curve(90e18, 50e18, 0, 5_000e18), CurveSide.Buy);
        makerOrder = router.buildOrder(positionMaker, position);

        base.mint(positionMaker, 50 ether);
        quoteToken.mint(positionMaker, 5_000 ether);
        vm.startPrank(positionMaker);
        base.approve(address(aqua), type(uint256).max);
        quoteToken.approve(address(aqua), type(uint256).max);
        hash = aqua.ship(address(router), abi.encode(makerOrder), _tokens(), _allocations(baseAllocation));
        vm.stopPrank();
    }

    function _fill(address positionMaker, bytes32 hash, ISwapVM.Order memory makerOrder, uint256 amount)
        private
        pure
        returns (FillRequest memory)
    {
        return FillRequest({
            maker: positionMaker,
            strategyHash: hash,
            expectedVersion: 0,
            amount: amount,
            strategy: abi.encode(makerOrder)
        });
    }

    function _singleFill(FillRequest memory fill) private pure returns (FillRequest[] memory fills) {
        fills = new FillRequest[](1);
        fills[0] = fill;
    }

    function _exactInputRoute(FillRequest[] memory fills, uint256 amountIn, uint256 minAmountOut, uint40 deadline)
        private
        view
        returns (ExactInputRoute memory route)
    {
        route = ExactInputRoute({
            baseToken: address(base),
            quoteToken: address(quoteToken),
            side: CurveSide.Sell,
            salt: keccak256(abi.encode(fills.length, amountIn, minAmountOut, deadline)),
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            recipient: recipient,
            refundRecipient: payer,
            deadline: deadline,
            fills: fills
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

    function _allocations(uint256 baseAllocation) private pure returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = baseAllocation;
        amounts[1] = 5_000 ether;
    }
}
