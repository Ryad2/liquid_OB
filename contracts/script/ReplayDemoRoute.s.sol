// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB repeatable multi-maker demo script added on 25 July 2026.

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {CurveSide} from "../src/types/CurveTypes.sol";
import {PositionConfig, PositionRuntime} from "../src/types/PositionTypes.sol";
import {ExactInputRoute, FillRequest, RouteResult} from "../src/types/RouteTypes.sol";
import {LiquidOBSwapVMRouter} from "../src/core/LiquidOBSwapVMRouter.sol";
import {LiquidOBBatchExecutor} from "../src/periphery/LiquidOBBatchExecutor.sol";
import {LiquidOBDemoToken} from "../src/demo/LiquidOBDemoToken.sol";
import {DemoPositions} from "./utils/DemoPositions.sol";

contract ReplayDemoRoute is Script {
    function run() external returns (RouteResult memory result) {
        uint256 takerPrivateKey = vm.envUint("TAKER_PRIVATE_KEY");
        address taker = vm.addr(takerPrivateKey);
        address maker = vm.envAddress("DEMO_MAKER");
        LiquidOBSwapVMRouter router = LiquidOBSwapVMRouter(payable(vm.envAddress("LIQUID_OB_ROUTER")));
        LiquidOBBatchExecutor executor = LiquidOBBatchExecutor(vm.envAddress("LIQUID_OB_BATCH_EXECUTOR"));
        LiquidOBDemoToken baseToken = LiquidOBDemoToken(vm.envAddress("DEMO_BASE_TOKEN"));
        LiquidOBDemoToken quoteToken = LiquidOBDemoToken(vm.envAddress("DEMO_QUOTE_TOKEN"));
        bytes32 epoch = vm.envOr("DEMO_EPOCH", bytes32(0));

        FillRequest[] memory fills = new FillRequest[](2);
        uint256 expectedOutput;
        uint256[2] memory inputs = [uint256(4_000e18), uint256(6_000e18)];
        for (uint256 i; i < fills.length; ++i) {
            (PositionConfig memory config, ISwapVM.Order memory order) =
                DemoPositions.build(router, maker, address(baseToken), address(quoteToken), i, epoch);
            config;
            bytes32 strategyHash = router.hash(order);
            PositionRuntime memory runtime = router.storedRuntime(maker, strategyHash);
            fills[i] = FillRequest({
                maker: maker,
                strategyHash: strategyHash,
                expectedVersion: runtime.version,
                amount: inputs[i],
                strategy: abi.encode(order)
            });
            expectedOutput += router.previewExactInput(order, CurveSide.Sell, runtime.version, inputs[i]).curve
                .amountOut;
        }

        ExactInputRoute memory route = ExactInputRoute({
            baseToken: address(baseToken),
            quoteToken: address(quoteToken),
            side: CurveSide.Sell,
            salt: keccak256(
                abi.encode("LIQUID_OB_DEMO_ROUTE", epoch, fills[0].expectedVersion, fills[1].expectedVersion)
            ),
            amountIn: inputs[0] + inputs[1],
            minAmountOut: (expectedOutput * 995) / 1_000,
            recipient: taker,
            refundRecipient: taker,
            deadline: uint40(block.timestamp + 20 minutes),
            fills: fills
        });

        vm.startBroadcast(takerPrivateKey);
        quoteToken.faucet(taker);
        IERC20(address(quoteToken)).approve(address(executor), route.amountIn);
        result = executor.executeExactInput(route);
        vm.stopBroadcast();

        console2.log("Demo route payer/recipient", taker);
        console2.log("Route input", result.amountIn);
        console2.log("Route output", result.amountOut);
        console2.log("Route fills", result.fillCount);
        console2.logBytes32(result.routeId);
    }
}
