// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB public-demo seeding script added on 25 July 2026.

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {PositionConfig} from "../src/types/PositionTypes.sol";
import {LiquidOBSwapVMRouter} from "../src/core/LiquidOBSwapVMRouter.sol";
import {LiquidOBDemoToken} from "../src/demo/LiquidOBDemoToken.sol";
import {DemoPositions} from "./utils/DemoPositions.sol";

contract SeedDemoPositions is Script {
    function run() external returns (bytes32[3] memory strategyHashes) {
        uint256 makerPrivateKey = vm.envUint("MAKER_PRIVATE_KEY");
        address maker = vm.addr(makerPrivateKey);
        IAqua aqua = IAqua(vm.envAddress("LIQUID_OB_AQUA"));
        LiquidOBSwapVMRouter router = LiquidOBSwapVMRouter(payable(vm.envAddress("LIQUID_OB_ROUTER")));
        LiquidOBDemoToken baseToken = LiquidOBDemoToken(vm.envAddress("DEMO_BASE_TOKEN"));
        LiquidOBDemoToken quoteToken = LiquidOBDemoToken(vm.envAddress("DEMO_QUOTE_TOKEN"));
        bytes32 epoch = vm.envOr("DEMO_EPOCH", bytes32(0));

        vm.startBroadcast(makerPrivateKey);
        baseToken.faucet(maker);
        quoteToken.faucet(maker);
        IERC20(address(baseToken)).approve(address(aqua), type(uint256).max);
        IERC20(address(quoteToken)).approve(address(aqua), type(uint256).max);

        address[] memory tokens = DemoPositions.tokens(address(baseToken), address(quoteToken));
        for (uint256 i; i < DemoPositions.COUNT; ++i) {
            (PositionConfig memory config, ISwapVM.Order memory order) =
                DemoPositions.build(router, maker, address(baseToken), address(quoteToken), i, epoch);
            bytes memory strategy = abi.encode(order);
            strategyHashes[i] = aqua.ship(address(router), strategy, tokens, DemoPositions.allocations(config));
            assert(strategyHashes[i] == router.hash(order));
        }
        vm.stopBroadcast();

        console2.log("Seed maker", maker);
        console2.log("Demo epoch");
        console2.logBytes32(epoch);
        for (uint256 i; i < strategyHashes.length; ++i) {
            console2.log("Position index", i);
            console2.logBytes32(strategyHashes[i]);
        }
    }
}
