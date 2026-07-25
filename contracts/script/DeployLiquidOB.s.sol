// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB deployment script added on 25 July 2026.

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";

import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";

import {LiquidOBSwapVMRouter} from "../src/core/LiquidOBSwapVMRouter.sol";
import {LiquidOBCurveKernel} from "../src/core/LiquidOBCurveKernel.sol";
import {LiquidOBBatchExecutor} from "../src/periphery/LiquidOBBatchExecutor.sol";
import {LiquidOBLens} from "../src/periphery/LiquidOBLens.sol";
import {LiquidOBQuoter} from "../src/periphery/LiquidOBQuoter.sol";
import {LiquidOBDemoToken} from "../src/demo/LiquidOBDemoToken.sol";

error LiquidOBDeploymentZeroOwner();
error LiquidOBDeploymentInvalidMaxFills(uint256 value);
error LiquidOBDeploymentMissingCode(address target);
error LiquidOBDeploymentConflictingAquaConfig(address configuredAqua);
error LiquidOBDeploymentLinkMismatch(address expected, address actual);

contract DeployLiquidOB is Script {
    struct Deployment {
        IAqua aqua;
        LiquidOBCurveKernel curveKernel;
        LiquidOBSwapVMRouter router;
        LiquidOBQuoter quoter;
        LiquidOBLens lens;
        LiquidOBBatchExecutor batchExecutor;
        LiquidOBDemoToken demoBase;
        LiquidOBDemoToken demoQuote;
    }

    function run() external returns (Deployment memory deployment) {
        uint256 privateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address broadcaster = vm.addr(privateKey);
        address owner = vm.envOr("LIQUID_OB_OWNER", broadcaster);
        uint256 rawMaxFills = vm.envOr("LIQUID_OB_MAX_FILLS", uint256(8));
        bool deployAqua = vm.envOr("LIQUID_OB_DEPLOY_AQUA", false);
        bool deployDemoTokens = vm.envOr("LIQUID_OB_DEPLOY_DEMO_TOKENS", false);
        address configuredAqua = vm.envOr("LIQUID_OB_AQUA", address(0));

        if (owner == address(0)) revert LiquidOBDeploymentZeroOwner();
        if (rawMaxFills == 0 || rawMaxFills > type(uint16).max) {
            revert LiquidOBDeploymentInvalidMaxFills(rawMaxFills);
        }
        if (deployAqua && configuredAqua != address(0)) {
            revert LiquidOBDeploymentConflictingAquaConfig(configuredAqua);
        }
        if (!deployAqua && configuredAqua.code.length == 0) {
            revert LiquidOBDeploymentMissingCode(configuredAqua);
        }

        vm.startBroadcast(privateKey);
        IAqua aqua = deployAqua ? IAqua(address(new Aqua())) : IAqua(configuredAqua);
        // The range check above proves the deployment value fits uint16.
        // forge-lint: disable-next-line(unsafe-typecast)
        deployment = _deployCore(aqua, owner, uint16(rawMaxFills));
        if (deployDemoTokens) {
            deployment.demoBase = new LiquidOBDemoToken("Liquid OB Demo Ether", "dETH", 18, 1_000e18);
            deployment.demoQuote = new LiquidOBDemoToken("Liquid OB Demo USD", "dUSD", 18, 1_000_000e18);
        }
        vm.stopBroadcast();

        validate(deployment);
        _log(deployment, owner, rawMaxFills);
    }

    /// @notice Testable deployment entry point for an existing Aqua contract.
    function deployCore(address aqua, address owner, uint16 maxFills) public returns (Deployment memory deployment) {
        if (owner == address(0)) revert LiquidOBDeploymentZeroOwner();
        if (maxFills == 0) revert LiquidOBDeploymentInvalidMaxFills(0);
        if (aqua.code.length == 0) revert LiquidOBDeploymentMissingCode(aqua);
        deployment = _deployCore(IAqua(aqua), owner, maxFills);
        validate(deployment);
    }

    function validate(Deployment memory deployment) public view {
        _requireCode(address(deployment.aqua));
        _requireCode(address(deployment.curveKernel));
        _requireCode(address(deployment.router));
        _requireCode(address(deployment.quoter));
        _requireCode(address(deployment.lens));
        _requireCode(address(deployment.batchExecutor));

        _requireLink(address(deployment.aqua), address(deployment.router.AQUA()));
        _requireLink(address(deployment.curveKernel), address(deployment.router.CURVE_KERNEL()));
        _requireLink(address(deployment.router), address(deployment.quoter.ROUTER()));
        _requireLink(address(deployment.router), address(deployment.lens.ROUTER()));
        _requireLink(address(deployment.aqua), address(deployment.lens.AQUA()));
        _requireLink(address(deployment.router), address(deployment.batchExecutor.ROUTER()));
        if (deployment.batchExecutor.MAX_FILLS() == 0) revert LiquidOBDeploymentInvalidMaxFills(0);
    }

    function _deployCore(IAqua aqua, address owner, uint16 maxFills) private returns (Deployment memory deployment) {
        deployment.aqua = aqua;
        deployment.curveKernel = new LiquidOBCurveKernel();
        deployment.router = new LiquidOBSwapVMRouter(address(aqua), address(deployment.curveKernel), owner);
        deployment.quoter = new LiquidOBQuoter(address(deployment.router));
        deployment.lens = new LiquidOBLens(address(deployment.router));
        deployment.batchExecutor = new LiquidOBBatchExecutor(address(deployment.router), maxFills);
    }

    function _requireCode(address target) private view {
        if (target.code.length == 0) revert LiquidOBDeploymentMissingCode(target);
    }

    function _requireLink(address expected, address actual) private pure {
        if (expected != actual) revert LiquidOBDeploymentLinkMismatch(expected, actual);
    }

    function _log(Deployment memory deployment, address owner, uint256 maxFills) private view {
        console2.log("Liquid OB chain id", block.chainid);
        console2.log("Liquid OB owner", owner);
        console2.log("Aqua", address(deployment.aqua));
        console2.log("LiquidOBCurveKernel", address(deployment.curveKernel));
        console2.log("LiquidOBSwapVMRouter", address(deployment.router));
        console2.log("LiquidOBQuoter", address(deployment.quoter));
        console2.log("LiquidOBLens", address(deployment.lens));
        console2.log("LiquidOBBatchExecutor", address(deployment.batchExecutor));
        console2.log("MAX_FILLS", maxFills);
        if (address(deployment.demoBase) != address(0)) {
            console2.log("Demo base token", address(deployment.demoBase));
            console2.log("Demo quote token", address(deployment.demoQuote));
        }
    }
}
