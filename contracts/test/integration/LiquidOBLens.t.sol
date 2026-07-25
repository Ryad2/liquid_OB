// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB lifecycle integration tests added on 25 July 2026.

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
import {PositionConfig, PositionLifecycle, PositionLocator, PositionSnapshot} from "../../src/types/PositionTypes.sol";
import {LiquidOBSwapVMRouter} from "../../src/core/LiquidOBSwapVMRouter.sol";
import {LiquidOBCurveKernel} from "../../src/core/LiquidOBCurveKernel.sol";
import {LiquidOBLens} from "../../src/periphery/LiquidOBLens.sol";

contract LiquidOBLensTest is Test {
    IAqua private aqua;
    LiquidOBSwapVMRouter private router;
    LiquidOBLens private lens;
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
        router = new LiquidOBSwapVMRouter(address(aqua), address(new LiquidOBCurveKernel()), address(this));
        lens = new LiquidOBLens(address(router));
        base = new TokenMock("Base", "BASE");
        quoteToken = new TokenMock("Quote", "QUOTE");
        config = _position();
        order = router.buildOrder(maker, config);

        base.mint(maker, 50 ether);
        quoteToken.mint(maker, 5_000 ether);
        quoteToken.mint(taker, 10_000 ether);
        vm.startPrank(maker);
        base.approve(address(aqua), type(uint256).max);
        quoteToken.approve(address(aqua), type(uint256).max);
        strategyHash = aqua.ship(address(router), abi.encode(order), _tokens(), _allocations());
        vm.stopPrank();
        vm.prank(taker);
        quoteToken.approve(address(router), type(uint256).max);
    }

    function testLensReportsActivePolicyRuntimeAndBacking() public view {
        PositionSnapshot memory snapshot = lens.getPosition(_locator());

        assertEq(uint8(snapshot.lifecycle), uint8(PositionLifecycle.Active));
        assertEq(snapshot.maker, maker);
        assertEq(snapshot.strategyHash, strategyHash);
        assertEq(snapshot.policyHash, keccak256(router.encodePosition(config)));
        assertEq(snapshot.runtime.version, 0);
        assertFalse(snapshot.runtime.initialized);
        assertEq(snapshot.baseBacking.aquaAllocation, 50 ether);
        assertEq(snapshot.quoteBacking.aquaAllocation, 5_000 ether);
        assertEq(AmountWad.unwrap(snapshot.baseBacking.logicalOutgoing), 50 ether);
        assertEq(AmountWad.unwrap(snapshot.quoteBacking.logicalOutgoing), 5_000 ether);
        assertTrue(snapshot.baseBacking.sufficientlyBacked);
        assertTrue(snapshot.quoteBacking.sufficientlyBacked);
    }

    function testLensTracksFillButIgnoresUnsolicitedAquaSurplus() public {
        vm.prank(taker);
        (, uint256 amountOut,) =
            router.swap(order, address(quoteToken), address(base), 1_000 ether, _takerTraits(true, 0, 0));
        PositionSnapshot memory afterFill = lens.getPosition(_locator());
        assertEq(afterFill.runtime.version, 1);
        assertEq(AmountWad.unwrap(afterFill.runtime.sell.y), 50 ether - amountOut);
        assertEq(AmountWad.unwrap(afterFill.runtime.buy.y), 6_000 ether);

        quoteToken.mint(address(this), 100 ether);
        quoteToken.approve(address(aqua), 100 ether);
        aqua.push(maker, address(router), strategyHash, address(quoteToken), 100 ether);

        PositionSnapshot memory afterSurplus = lens.getPosition(_locator());
        assertEq(afterSurplus.quoteBacking.aquaAllocation, 6_100 ether);
        assertEq(AmountWad.unwrap(afterSurplus.quoteBacking.logicalOutgoing), 6_000 ether);
        assertEq(afterSurplus.runtime.version, 1);
    }

    function testLensClassifiesDockedPositionAndBatchReads() public {
        vm.prank(maker);
        aqua.dock(address(router), strategyHash, _tokens());

        PositionLocator[] memory locators = new PositionLocator[](1);
        locators[0] = _locator();
        PositionSnapshot[] memory snapshots = lens.getPositions(locators);
        assertEq(snapshots.length, 1);
        assertEq(uint8(snapshots[0].lifecycle), uint8(PositionLifecycle.Docked));
        assertEq(snapshots[0].baseBacking.aquaAllocation, 0);
        assertEq(snapshots[0].quoteBacking.aquaAllocation, 0);
        assertFalse(snapshots[0].baseBacking.sufficientlyBacked);
        assertFalse(snapshots[0].quoteBacking.sufficientlyBacked);
    }

    function _position() private view returns (PositionConfig memory position) {
        position.baseToken = address(base);
        position.quoteToken = address(quoteToken);
        position.salt = keccak256("lens-position");
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

    function _locator() private view returns (PositionLocator memory) {
        return PositionLocator({maker: maker, strategyHash: strategyHash, strategy: abi.encode(order)});
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
