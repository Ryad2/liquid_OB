// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB demo-position fixtures added on 25 July 2026.

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
import {PositionConfig} from "../../src/types/PositionTypes.sol";
import {LiquidOBSwapVMRouter} from "../../src/core/LiquidOBSwapVMRouter.sol";

error LiquidOBInvalidDemoPosition(uint256 index);

/// @notice Deterministic three-position demo market shared by seed, replay, and dock scripts.
library DemoPositions {
    uint256 internal constant COUNT = 3;

    function build(
        LiquidOBSwapVMRouter router,
        address maker,
        address baseToken,
        address quoteToken,
        uint256 index,
        bytes32 epoch
    ) internal view returns (PositionConfig memory config, ISwapVM.Order memory order) {
        config.baseToken = baseToken;
        config.quoteToken = quoteToken;
        config.salt = keccak256(abi.encode("LIQUID_OB_DEMO", epoch, index));

        if (index == 0) {
            config.sell = router.deriveCurve(_curve(1_900e18, 2_050e18, 2e18, 100e18), CurveSide.Sell);
            config.buy = router.deriveCurve(_curve(1_850e18, 1_700e18, -1e18, 185_000e18), CurveSide.Buy);
        } else if (index == 1) {
            config.sell = router.deriveCurve(_curve(2_000e18, 2_400e18, 0, 150e18), CurveSide.Sell);
            config.buy = router.deriveCurve(_curve(1_900e18, 1_500e18, 1e18, 285_000e18), CurveSide.Buy);
        } else if (index == 2) {
            config.sell = router.deriveCurve(_curve(2_100e18, 2_100e18, 0, 50e18), CurveSide.Sell);
            config.buy = router.deriveCurve(_curve(1_800e18, 1_800e18, 0, 90_000e18), CurveSide.Buy);
        } else {
            revert LiquidOBInvalidDemoPosition(index);
        }

        order = router.buildOrder(maker, config);
    }

    function allocations(PositionConfig memory config) internal pure returns (uint256[] memory amounts) {
        amounts = new uint256[](2);
        amounts[0] = AmountWad.unwrap(config.sell.initialReserve);
        amounts[1] = AmountWad.unwrap(config.buy.initialReserve);
    }

    function tokens(address baseToken, address quoteToken) internal pure returns (address[] memory result) {
        result = new address[](2);
        result[0] = baseToken;
        result[1] = quoteToken;
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
}
