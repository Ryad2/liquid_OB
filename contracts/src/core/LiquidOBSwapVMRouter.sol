// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB router extension added on 25 July 2026.

import {AquaSwapVMRouter} from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraits} from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import {Context} from "@1inch/swap-vm/src/libs/VM.sol";

import {CurveConfig, CurveSide, CurveTypesLib, QuoteKind} from "../types/CurveTypes.sol";
import {PositionConfig, PositionQuote, PositionRuntime} from "../types/PositionTypes.sol";
import {CurveCompiler} from "../libraries/CurveCompiler.sol";
import {PositionCodec} from "../libraries/PositionCodec.sol";
import {PositionMath} from "../libraries/PositionMath.sol";
import {LiquidCurveInstruction} from "./LiquidCurveInstruction.sol";

/// @notice Official Aqua/SwapVM router extended by one bounded maker-curve opcode.
contract LiquidOBSwapVMRouter is AquaSwapVMRouter, LiquidCurveInstruction {
    uint256 private constant USE_AQUA_TRAIT = 1 << 254;
    uint256 private constant PROGRAM_OFFSET_SHIFT = 208;

    constructor(address aqua, address owner) AquaSwapVMRouter(aqua, address(0), owner, "Liquid OB SwapVM", "1") {}

    function liquidCurveOpcode() public pure returns (uint8) {
        return uint8(super._opcodes().length);
    }

    function deriveCurve(CurveConfig calldata config, CurveSide side) external pure returns (CurveConfig memory) {
        return CurveCompiler.derive(config, side);
    }

    function encodePosition(PositionConfig calldata config) external pure returns (bytes memory) {
        return PositionCodec.encode(config);
    }

    function decodePosition(ISwapVM.Order calldata order) external pure returns (PositionConfig memory) {
        return _decodeOrderConfig(order);
    }

    function buildOrder(address maker, PositionConfig calldata config)
        external
        pure
        returns (ISwapVM.Order memory order)
    {
        bytes memory payload = PositionCodec.encode(config);
        bytes memory program = abi.encodePacked(liquidCurveOpcode(), uint8(0));
        order = ISwapVM.Order({
            maker: maker,
            traits: MakerTraits.wrap(USE_AQUA_TRAIT | (POSITION_PAYLOAD_LENGTH << PROGRAM_OFFSET_SHIFT)),
            data: bytes.concat(payload, program)
        });
    }

    function previewExactInput(ISwapVM.Order calldata order, CurveSide side, uint64 expectedVersion, uint256 amountIn)
        external
        view
        returns (PositionQuote memory quote)
    {
        return _preview(order, side, expectedVersion, QuoteKind.ExactInput, amountIn);
    }

    function previewExactOutput(ISwapVM.Order calldata order, CurveSide side, uint64 expectedVersion, uint256 amountOut)
        external
        view
        returns (PositionQuote memory quote)
    {
        return _preview(order, side, expectedVersion, QuoteKind.ExactOutput, amountOut);
    }

    function storedRuntime(address maker, bytes32 strategyHash) external view returns (PositionRuntime memory runtime) {
        return _runtime(PositionCodec.positionKey(maker, strategyHash));
    }

    function resolvedRuntime(ISwapVM.Order calldata order) external view returns (PositionRuntime memory runtime) {
        bytes32 strategyHash = hash(order);
        PositionConfig memory config = _decodeOrderConfig(order);
        return PositionMath.resolve(config, _runtime(PositionCodec.positionKey(order.maker, strategyHash)));
    }

    function _preview(
        ISwapVM.Order calldata order,
        CurveSide side,
        uint64 expectedVersion,
        QuoteKind kind,
        uint256 rawAmount
    ) private view returns (PositionQuote memory quote) {
        bytes32 strategyHash = hash(order);
        PositionConfig memory config = _decodeOrderConfig(order);
        address tokenIn = CurveTypesLib.tokenIn(side, config.baseToken, config.quoteToken);
        address tokenOut = CurveTypesLib.tokenOut(side, config.baseToken, config.quoteToken);
        (, uint256 outputBalance) = AQUA.safeBalances(order.maker, address(this), strategyHash, tokenIn, tokenOut);
        (quote,) =
            _quotePosition(config, order.maker, strategyHash, side, expectedVersion, kind, rawAmount, outputBalance);
    }

    function _opcodes()
        internal
        pure
        override
        returns (function(Context memory, bytes calldata) internal[] memory result)
    {
        function(Context memory, bytes calldata) internal[] memory upstream = super._opcodes();
        result = new function(Context memory, bytes calldata) internal[](upstream.length + 1);
        for (uint256 i; i < upstream.length; ++i) {
            result[i] = upstream[i];
        }
        result[upstream.length] = LiquidCurveInstruction._liquidCurve;
    }
}
