// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB integration tests added on 25 July 2026.

import {Test} from "forge-std/Test.sol";

import {Aqua} from "@1inch/aqua/src/Aqua.sol";
import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {SafeERC20} from "@1inch/solidity-utils/contracts/libraries/SafeERC20.sol";
import {TokenMock} from "@1inch/solidity-utils/contracts/mocks/TokenMock.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib} from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import {TakerTraitsLib} from "@1inch/swap-vm/src/libs/TakerTraits.sol";

import {FixedRateSmokeRouter} from "../helpers/FixedRateSmokeRouter.sol";

abstract contract AquaSwapVMSmokeTestBase is Test {
    uint256 private constant MAKER_OUTPUT = 1_000 ether;
    uint256 private constant TAKER_INPUT = 1_000 ether;
    uint8 private constant DOCKED = type(uint8).max;

    IAqua private aqua;
    FixedRateSmokeRouter private router;
    TokenMock private tokenIn;
    TokenMock private tokenOut;

    address private maker;
    address private taker;
    ISwapVM.Order private order;
    bytes32 private strategyHash;

    function setUp() public virtual {
        maker = makeAddr("maker");
        taker = makeAddr("taker");

        aqua = _deployAqua();
        router = new FixedRateSmokeRouter(address(aqua), address(this));
        tokenIn = new TokenMock("Input Token", "IN");
        tokenOut = new TokenMock("Output Token", "OUT");

        tokenIn.mint(taker, TAKER_INPUT);
        tokenOut.mint(maker, MAKER_OUTPUT);

        vm.prank(maker);
        tokenIn.approve(address(aqua), type(uint256).max);
        vm.prank(maker);
        tokenOut.approve(address(aqua), type(uint256).max);
        vm.prank(taker);
        tokenIn.approve(address(router), type(uint256).max);

        order = _buildOrder();
        bytes memory encodedOrder = abi.encode(order);

        vm.prank(maker);
        strategyHash = aqua.ship(address(router), encodedOrder, _tokens(), _initialAllocations());

        assertEq(strategyHash, keccak256(encodedOrder), "Aqua must hash the exact shipped bytes");
        assertEq(strategyHash, router.hash(order), "SwapVM and Aqua strategy hashes must agree");
    }

    function testStaticQuoteSupportsExactInputAndExactOutputWithoutMutation() public {
        (uint256 balanceInBefore, uint256 balanceOutBefore) = _activeBalances();

        bytes memory exactInTraits = _takerTraits(true, 99 ether);
        vm.prank(taker);
        (uint256 exactIn, uint256 quotedOut, bytes32 quotedHash) =
            ISwapVM(address(router)).quote(order, address(tokenIn), address(tokenOut), 100 ether, exactInTraits);

        assertEq(exactIn, 100 ether);
        assertEq(quotedOut, 100 ether);
        assertEq(quotedHash, strategyHash);

        bytes memory exactOutTraits = _takerTraits(false, 101 ether);
        vm.prank(taker);
        (uint256 quotedIn, uint256 exactOut, bytes32 exactOutHash) =
            ISwapVM(address(router)).quote(order, address(tokenIn), address(tokenOut), 100 ether, exactOutTraits);

        assertEq(quotedIn, 100 ether);
        assertEq(exactOut, 100 ether);
        assertEq(exactOutHash, strategyHash);
        assertEq(_activeBalance(address(tokenIn)), balanceInBefore, "quote mutated input allocation");
        assertEq(_activeBalance(address(tokenOut)), balanceOutBefore, "quote mutated output allocation");
    }

    function testShipSwapAndDockMovesRealTokensAndClosesStrategy() public {
        uint256 amount = 100 ether;

        vm.prank(taker);
        (uint256 amountIn, uint256 amountOut, bytes32 executedHash) =
            router.swap(order, address(tokenIn), address(tokenOut), amount, _takerTraits(true, amount));

        assertEq(amountIn, amount);
        assertEq(amountOut, amount);
        assertEq(executedHash, strategyHash);

        assertEq(tokenIn.balanceOf(maker), amount, "maker did not receive taker input");
        assertEq(tokenOut.balanceOf(maker), MAKER_OUTPUT - amount, "maker output was not transferred");
        assertEq(tokenIn.balanceOf(taker), TAKER_INPUT - amount, "taker input was not spent");
        assertEq(tokenOut.balanceOf(taker), amount, "taker did not receive maker output");
        assertEq(tokenIn.balanceOf(address(aqua)), 0, "Aqua must remain non-custodial");
        assertEq(tokenOut.balanceOf(address(aqua)), 0, "Aqua must remain non-custodial");
        assertEq(tokenIn.balanceOf(address(router)), 0, "router retained input tokens");
        assertEq(tokenOut.balanceOf(address(router)), 0, "router retained output tokens");

        (uint256 allocatedIn, uint256 allocatedOut) = _activeBalances();
        assertEq(allocatedIn, amount, "Aqua input allocation was not credited");
        assertEq(allocatedOut, MAKER_OUTPUT - amount, "Aqua output allocation was not debited");

        vm.prank(maker);
        aqua.dock(address(router), strategyHash, _tokens());

        (uint248 dockedIn, uint8 inTokenCount) =
            aqua.rawBalances(maker, address(router), strategyHash, address(tokenIn));
        (uint248 dockedOut, uint8 outTokenCount) =
            aqua.rawBalances(maker, address(router), strategyHash, address(tokenOut));
        assertEq(dockedIn, 0);
        assertEq(dockedOut, 0);
        assertEq(inTokenCount, DOCKED);
        assertEq(outTokenCount, DOCKED);

        vm.expectRevert(
            abi.encodeWithSelector(
                IAqua.SafeBalancesForTokenNotInActiveStrategy.selector,
                maker,
                address(router),
                strategyHash,
                address(tokenIn)
            )
        );
        aqua.safeBalances(maker, address(router), strategyHash, address(tokenIn), address(tokenOut));
    }

    function testExactOutputSwapSettlesRequestedOutputWithinMaximumInput() public {
        uint256 requestedOutput = 75 ether;

        vm.prank(taker);
        (uint256 amountIn, uint256 amountOut, bytes32 executedHash) = router.swap(
            order, address(tokenIn), address(tokenOut), requestedOutput, _takerTraits(false, requestedOutput)
        );

        assertEq(amountIn, requestedOutput);
        assertEq(amountOut, requestedOutput);
        assertEq(executedHash, strategyHash);
        assertEq(tokenIn.balanceOf(maker), requestedOutput);
        assertEq(tokenOut.balanceOf(taker), requestedOutput);

        (uint256 allocatedIn, uint256 allocatedOut) = _activeBalances();
        assertEq(allocatedIn, requestedOutput);
        assertEq(allocatedOut, MAKER_OUTPUT - requestedOutput);
    }

    function testRevertsAtomicallyWhenTakerPaymentFails() public {
        uint256 amount = 100 ether;

        vm.prank(taker);
        tokenIn.approve(address(router), 0);

        vm.prank(taker);
        vm.expectRevert(SafeERC20.SafeTransferFromFailed.selector);
        router.swap(order, address(tokenIn), address(tokenOut), amount, _takerTraits(true, amount));

        assertEq(tokenIn.balanceOf(maker), 0);
        assertEq(tokenOut.balanceOf(maker), MAKER_OUTPUT);
        assertEq(tokenIn.balanceOf(taker), TAKER_INPUT);
        assertEq(tokenOut.balanceOf(taker), 0);

        (uint256 allocatedIn, uint256 allocatedOut) = _activeBalances();
        assertEq(allocatedIn, 0);
        assertEq(allocatedOut, MAKER_OUTPUT);
    }

    function _buildOrder() private view returns (ISwapVM.Order memory) {
        bytes memory program = abi.encodePacked(router.smokeOpcode(), uint8(0));

        return MakerTraitsLib.build(
            MakerTraitsLib.Args({
                maker: maker,
                receiver: address(0),
                shouldUnwrapWeth: false,
                useAquaInsteadOfSignature: true,
                allowZeroAmountIn: false,
                hasPreTransferInHook: false,
                hasPostTransferInHook: false,
                hasPreTransferOutHook: false,
                hasPostTransferOutHook: false,
                preTransferInTarget: address(0),
                preTransferInData: "",
                postTransferInTarget: address(0),
                postTransferInData: "",
                preTransferOutTarget: address(0),
                preTransferOutData: "",
                postTransferOutTarget: address(0),
                postTransferOutData: "",
                program: program
            })
        );
    }

    function _takerTraits(bool isExactIn, uint256 threshold) private view returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: taker,
                isExactIn: isExactIn,
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
                instructionsArgs: "",
                signature: ""
            })
        );
    }

    function _tokens() private view returns (address[] memory tokens) {
        tokens = new address[](2);
        tokens[0] = address(tokenIn);
        tokens[1] = address(tokenOut);
    }

    function _initialAllocations() private pure returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = 0;
        amounts[1] = MAKER_OUTPUT;
    }

    function _activeBalances() private view returns (uint256 balanceIn, uint256 balanceOut) {
        return aqua.safeBalances(maker, address(router), strategyHash, address(tokenIn), address(tokenOut));
    }

    function _activeBalance(address token) private view returns (uint256 balance) {
        (uint248 rawBalance,) = aqua.rawBalances(maker, address(router), strategyHash, token);
        return rawBalance;
    }

    function _deployAqua() internal virtual returns (IAqua);
}

contract AquaSwapVMLocalSmokeTest is AquaSwapVMSmokeTestBase {
    function _deployAqua() internal override returns (IAqua) {
        return IAqua(address(new Aqua()));
    }
}

contract AquaSwapVMOfficialBaseForkTest is AquaSwapVMSmokeTestBase {
    uint256 private constant VERIFIED_BASE_BLOCK = 49_105_058;
    address private constant OFFICIAL_AQUA = 0x499943E74FB0cE105688beeE8Ef2ABec5D936d31;
    address private constant OFFICIAL_SWAP_VM = 0x8fDD04Dbf6111437B44bbca99C28882434e0958f;

    function setUp() public override {
        string memory rpcUrl = vm.envOr("BASE_MAINNET_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) {
            vm.skip(true);
            return;
        }

        vm.createSelectFork(rpcUrl, VERIFIED_BASE_BLOCK);
        assertGt(OFFICIAL_AQUA.code.length, 0, "official Aqua has no code");
        assertGt(OFFICIAL_SWAP_VM.code.length, 0, "official SwapVM has no code");

        (bool success, bytes memory result) = OFFICIAL_SWAP_VM.staticcall(abi.encodeWithSignature("AQUA()"));
        assertTrue(success, "official SwapVM AQUA getter failed");
        assertEq(abi.decode(result, (address)), OFFICIAL_AQUA, "official deployments are not paired");

        super.setUp();
    }

    function _deployAqua() internal pure override returns (IAqua) {
        return IAqua(OFFICIAL_AQUA);
    }
}
