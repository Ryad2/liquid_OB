// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB demo cleanup script added on 25 July 2026.

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";

import {PositionConfig} from "../src/types/PositionTypes.sol";
import {LiquidOBSwapVMRouter} from "../src/core/LiquidOBSwapVMRouter.sol";
import {DemoPositions} from "./utils/DemoPositions.sol";

contract DockDemoPositions is Script {
    function run() external returns (bytes32[3] memory strategyHashes) {
        uint256 makerPrivateKey = vm.envUint("MAKER_PRIVATE_KEY");
        address maker = vm.addr(makerPrivateKey);
        IAqua aqua = IAqua(vm.envAddress("LIQUID_OB_AQUA"));
        LiquidOBSwapVMRouter router = LiquidOBSwapVMRouter(payable(vm.envAddress("LIQUID_OB_ROUTER")));
        address baseToken = vm.envAddress("DEMO_BASE_TOKEN");
        address quoteToken = vm.envAddress("DEMO_QUOTE_TOKEN");
        bytes32 epoch = vm.envOr("DEMO_EPOCH", bytes32(0));
        address[] memory tokens = DemoPositions.tokens(baseToken, quoteToken);

        vm.startBroadcast(makerPrivateKey);
        for (uint256 i; i < DemoPositions.COUNT; ++i) {
            (PositionConfig memory config, ISwapVM.Order memory order) =
                DemoPositions.build(router, maker, baseToken, quoteToken, i, epoch);
            config;
            strategyHashes[i] = router.hash(order);
            aqua.dock(address(router), strategyHashes[i], tokens);
        }
        vm.stopBroadcast();

        console2.log("Docked demo epoch");
        console2.logBytes32(epoch);
    }
}
