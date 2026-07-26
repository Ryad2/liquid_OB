// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

import {IAqua} from "@1inch/aqua/src/interfaces/IAqua.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {ILiquidOBLens} from "../interfaces/ILiquidOBLens.sol";
import {AmountWad, Rounding} from "../types/CurveTypes.sol";
import {
    AssetBacking,
    PositionConfig,
    PositionLifecycle,
    PositionLocator,
    PositionRuntime,
    PositionSnapshot
} from "../types/PositionTypes.sol";
import {LiquidOBMakerMismatch, LiquidOBStrategyHashMismatch, LiquidOBZeroAddress} from "../types/ProtocolErrors.sol";
import {FullPrecisionMath} from "../libraries/FullPrecisionMath.sol";
import {PositionCodec} from "../libraries/PositionCodec.sol";
import {LiquidOBSwapVMRouter} from "../core/LiquidOBSwapVMRouter.sol";

/// @notice Reconciles immutable policy, router runtime, and Aqua/wallet backing.
contract LiquidOBLens is ILiquidOBLens {
    uint8 private constant DOCKED_TOKEN_COUNT = type(uint8).max;
    uint8 private constant POSITION_ENCODING_VERSION = 1;

    LiquidOBSwapVMRouter public immutable ROUTER;
    IAqua public immutable AQUA;

    constructor(address router) {
        if (router == address(0)) revert LiquidOBZeroAddress();
        ROUTER = LiquidOBSwapVMRouter(payable(router));
        AQUA = ROUTER.AQUA();
    }

    function getPosition(PositionLocator calldata position) public view returns (PositionSnapshot memory snapshot) {
        ISwapVM.Order memory order = abi.decode(position.strategy, (ISwapVM.Order));
        if (order.maker != position.maker) revert LiquidOBMakerMismatch(position.maker, order.maker);

        bytes32 exactStrategyHash = PositionCodec.hashStrategy(position.strategy);
        if (exactStrategyHash != position.strategyHash) {
            revert LiquidOBStrategyHashMismatch(position.strategyHash, exactStrategyHash);
        }
        bytes32 routerHash = ROUTER.hash(order);
        if (routerHash != exactStrategyHash) {
            revert LiquidOBStrategyHashMismatch(exactStrategyHash, routerHash);
        }

        PositionConfig memory config = ROUTER.decodePosition(order);
        PositionRuntime memory runtime = ROUTER.resolvedRuntime(order);
        (uint248 baseAllocation, uint8 baseTokenCount) =
            AQUA.rawBalances(position.maker, address(ROUTER), exactStrategyHash, config.baseToken);
        (uint248 quoteAllocation, uint8 quoteTokenCount) =
            AQUA.rawBalances(position.maker, address(ROUTER), exactStrategyHash, config.quoteToken);
        PositionLifecycle lifecycle = _lifecycle(baseTokenCount, quoteTokenCount);

        snapshot = PositionSnapshot({
            marketId: PositionCodec.marketId(config.baseToken, config.quoteToken),
            positionKey: PositionCodec.positionKey(position.maker, exactStrategyHash),
            positionId: PositionCodec.positionId(block.chainid, address(ROUTER), position.maker, exactStrategyHash),
            strategyHash: exactStrategyHash,
            policyHash: PositionCodec.hashPayload(PositionCodec.encode(config)),
            maker: position.maker,
            encodingVersion: POSITION_ENCODING_VERSION,
            lifecycle: lifecycle,
            config: config,
            runtime: runtime,
            baseBacking: _backing(config.baseToken, position.maker, uint256(baseAllocation), runtime.sell.y, lifecycle),
            quoteBacking: _backing(
                config.quoteToken, position.maker, uint256(quoteAllocation), runtime.buy.y, lifecycle
            )
        });
    }

    function getPositions(PositionLocator[] calldata positions)
        external
        view
        returns (PositionSnapshot[] memory snapshots)
    {
        snapshots = new PositionSnapshot[](positions.length);
        for (uint256 i; i < positions.length; ++i) {
            snapshots[i] = getPosition(positions[i]);
        }
    }

    function marketId(address baseToken, address quoteToken) external pure returns (bytes32) {
        return PositionCodec.marketId(baseToken, quoteToken);
    }

    function positionKey(address maker, bytes32 strategyHash) external pure returns (bytes32) {
        return PositionCodec.positionKey(maker, strategyHash);
    }

    function positionId(uint256 chainId, address router, address maker, bytes32 strategyHash)
        external
        pure
        returns (bytes32)
    {
        return PositionCodec.positionId(chainId, router, maker, strategyHash);
    }

    function _backing(
        address token,
        address maker,
        uint256 aquaAllocation,
        AmountWad logicalOutgoing,
        PositionLifecycle lifecycle
    ) private view returns (AssetBacking memory backing) {
        uint8 decimals = IERC20Metadata(token).decimals();
        uint256 requiredRaw = FullPrecisionMath.wadToRaw(token, logicalOutgoing, decimals, Rounding.Up);
        uint256 walletBalance = IERC20(token).balanceOf(maker);
        uint256 aquaAllowance = IERC20(token).allowance(maker, address(AQUA));
        backing = AssetBacking({
            token: token,
            decimals: decimals,
            aquaAllocation: aquaAllocation,
            walletBalance: walletBalance,
            aquaAllowance: aquaAllowance,
            logicalOutgoing: logicalOutgoing,
            sufficientlyBacked: lifecycle == PositionLifecycle.Active && aquaAllocation >= requiredRaw
                && walletBalance >= requiredRaw && aquaAllowance >= requiredRaw
        });
    }

    function _lifecycle(uint8 baseTokenCount, uint8 quoteTokenCount) private pure returns (PositionLifecycle) {
        if (baseTokenCount == DOCKED_TOKEN_COUNT && quoteTokenCount == DOCKED_TOKEN_COUNT) {
            return PositionLifecycle.Docked;
        }
        if (
            baseTokenCount > 0 && quoteTokenCount > 0 && baseTokenCount != DOCKED_TOKEN_COUNT
                && quoteTokenCount != DOCKED_TOKEN_COUNT
        ) {
            return PositionLifecycle.Active;
        }
        return PositionLifecycle.Unknown;
    }
}
