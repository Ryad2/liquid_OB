// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB deployment tests added on 25 July 2026.

import {Test} from "forge-std/Test.sol";

import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CurveSide} from "../../src/types/CurveTypes.sol";
import {
    PositionConfig,
    PositionLocator,
    PositionQuote,
    PositionSnapshot,
    QuoteParams
} from "../../src/types/PositionTypes.sol";
import {ExactInputRoute, FillRequest, RouteResult} from "../../src/types/RouteTypes.sol";
import {LiquidOBMissingCode, LiquidOBZeroAddress} from "../../src/types/ProtocolErrors.sol";
import {LiquidOBSwapVMRouter} from "../../src/core/LiquidOBSwapVMRouter.sol";
import {LiquidOBDemoToken} from "../../src/demo/LiquidOBDemoToken.sol";
import {DemoPositions} from "../../script/utils/DemoPositions.sol";
import {
    DeployLiquidOB,
    LiquidOBDeploymentInvalidMaxFills,
    LiquidOBDeploymentMissingCode,
    LiquidOBDeploymentZeroOwner
} from "../../script/DeployLiquidOB.s.sol";

contract DeployLiquidOBTest is Test {
    DeployLiquidOB private deployer;
    DeployLiquidOB.Deployment private deployment;
    address private owner;

    function setUp() public {
        owner = makeAddr("owner");
        deployer = new DeployLiquidOB();
        deployment = deployer.deployCore(address(new Aqua()), owner, 8);
    }

    function testDeploymentWiresEveryImmutableDependency() public view {
        assertGt(address(deployment.aqua).code.length, 0);
        assertGt(address(deployment.curveKernel).code.length, 0);
        assertGt(address(deployment.router).code.length, 0);
        assertGt(address(deployment.quoter).code.length, 0);
        assertGt(address(deployment.lens).code.length, 0);
        assertGt(address(deployment.batchExecutor).code.length, 0);
        assertEq(deployment.router.owner(), owner);
        assertEq(address(deployment.router.AQUA()), address(deployment.aqua));
        assertEq(address(deployment.router.CURVE_KERNEL()), address(deployment.curveKernel));
        assertEq(address(deployment.quoter.ROUTER()), address(deployment.router));
        assertEq(address(deployment.lens.ROUTER()), address(deployment.router));
        assertEq(address(deployment.lens.AQUA()), address(deployment.aqua));
        assertEq(address(deployment.batchExecutor.ROUTER()), address(deployment.router));
        assertEq(deployment.batchExecutor.MAX_FILLS(), 8);
        assertEq(deployment.router.liquidCurveOpcode(), 0);
    }

    function testDeploymentRejectsUnsafeConfiguration() public {
        vm.expectRevert(LiquidOBDeploymentZeroOwner.selector);
        deployer.deployCore(address(deployment.aqua), address(0), 8);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBDeploymentInvalidMaxFills.selector, uint256(0)));
        deployer.deployCore(address(deployment.aqua), owner, 0);

        address noCode = makeAddr("no-code");
        vm.expectRevert(abi.encodeWithSelector(LiquidOBDeploymentMissingCode.selector, noCode));
        deployer.deployCore(noCode, owner, 8);

        vm.expectRevert(abi.encodeWithSelector(LiquidOBMissingCode.selector, noCode));
        new LiquidOBSwapVMRouter(address(deployment.aqua), noCode, owner);
    }

    function testDemoTokenIsExplicitlyPermissionlessAndValueless() public {
        LiquidOBDemoToken token = new LiquidOBDemoToken("Demo", "DEMO", 6, 1_000e6);
        address recipient = makeAddr("recipient");

        vm.prank(makeAddr("anyone"));
        uint256 amount = token.faucet(recipient);

        assertEq(amount, 1_000e6);
        assertEq(token.balanceOf(recipient), amount);
        assertEq(token.decimals(), 6);

        vm.expectRevert(LiquidOBZeroAddress.selector);
        token.faucet(address(0));
    }

    function testFreshDeploymentPublishesReadsQuotesAndSettles() public {
        LiquidOBDemoToken base = new LiquidOBDemoToken("Demo Ether", "dETH", 18, 1_000e18);
        LiquidOBDemoToken quoteToken = new LiquidOBDemoToken("Demo USD", "dUSD", 18, 1_000_000e18);
        address maker = makeAddr("maker");
        address payer = makeAddr("payer");
        address recipient = makeAddr("recipient");
        (PositionConfig memory config, ISwapVM.Order memory order) =
            DemoPositions.build(deployment.router, maker, address(base), address(quoteToken), 0, bytes32(0));
        bytes memory strategy = abi.encode(order);

        base.faucet(maker);
        quoteToken.faucet(maker);
        quoteToken.faucet(payer);
        vm.startPrank(maker);
        IERC20(address(base)).approve(address(deployment.aqua), type(uint256).max);
        IERC20(address(quoteToken)).approve(address(deployment.aqua), type(uint256).max);
        bytes32 strategyHash = deployment.aqua
            .ship(
                address(deployment.router),
                strategy,
                DemoPositions.tokens(address(base), address(quoteToken)),
                DemoPositions.allocations(config)
            );
        vm.stopPrank();

        PositionLocator memory locator = PositionLocator({maker: maker, strategyHash: strategyHash, strategy: strategy});
        PositionSnapshot memory snapshot = deployment.lens.getPosition(locator);
        assertTrue(snapshot.baseBacking.sufficientlyBacked);
        assertTrue(snapshot.quoteBacking.sufficientlyBacked);

        uint256 amountIn = 10_000e18;
        PositionQuote memory positionQuote = deployment.quoter
            .quoteExactInput(
                QuoteParams({position: locator, side: CurveSide.Sell, expectedVersion: 0, amount: amountIn})
            );
        FillRequest[] memory fills = new FillRequest[](1);
        fills[0] = FillRequest({
            maker: maker, strategyHash: strategyHash, expectedVersion: 0, amount: amountIn, strategy: strategy
        });
        ExactInputRoute memory route = ExactInputRoute({
            baseToken: address(base),
            quoteToken: address(quoteToken),
            side: CurveSide.Sell,
            salt: keccak256("fresh-deployment"),
            amountIn: amountIn,
            minAmountOut: positionQuote.curve.amountOut,
            recipient: recipient,
            refundRecipient: payer,
            deadline: uint40(block.timestamp + 1 hours),
            fills: fills
        });

        vm.startPrank(payer);
        IERC20(address(quoteToken)).approve(address(deployment.batchExecutor), amountIn);
        RouteResult memory result = deployment.batchExecutor.executeExactInput(route);
        vm.stopPrank();

        assertEq(result.amountIn, amountIn);
        assertEq(result.amountOut, positionQuote.curve.amountOut);
        assertEq(base.balanceOf(recipient), result.amountOut);
        assertEq(deployment.router.storedRuntime(maker, strategyHash).version, 1);
        assertEq(base.balanceOf(address(deployment.batchExecutor)), 0);
        assertEq(quoteToken.balanceOf(address(deployment.batchExecutor)), 0);
    }
}
