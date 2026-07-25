// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB custom instruction added on 25 July 2026.

import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib, MakerTraits} from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import {Context, ContextLib} from "@1inch/swap-vm/src/libs/VM.sol";

import {ILiquidOBEvents} from "../interfaces/ILiquidOBEvents.sol";
import {ILiquidOBCurveKernel} from "../interfaces/ILiquidOBCurveKernel.sol";
import {AmountWad, CurveBranch, CurveSide, PriceWad, QuoteKind, RateWad} from "../types/CurveTypes.sol";
import {PositionConfig, PositionQuote, PositionRuntime} from "../types/PositionTypes.sol";
import {
    LiquidOBInvalidDirection,
    LiquidOBInvalidExpectedVersionLength,
    LiquidOBInvalidInstructionArguments,
    LiquidOBMissingCode,
    LiquidOBZeroAddress
} from "../types/ProtocolErrors.sol";
import {PositionCodec} from "../libraries/PositionCodec.sol";

/// @notice SwapVM instruction that quotes and atomically materializes one Liquid OB fill.
abstract contract LiquidCurveInstruction is ILiquidOBEvents {
    using ContextLib for Context;
    using MakerTraitsLib for MakerTraits;

    uint256 internal constant POSITION_PAYLOAD_LENGTH = 269;

    ILiquidOBCurveKernel public immutable CURVE_KERNEL;
    mapping(bytes32 positionKey => PositionRuntime runtime) internal _positionRuntimes;

    struct ExecutionMetadata {
        uint64 expectedVersion;
        bytes32 routeId;
        uint16 fillIndex;
        address payer;
        address recipient;
    }

    constructor(address curveKernel) {
        if (curveKernel == address(0)) revert LiquidOBZeroAddress();
        if (curveKernel.code.length == 0) revert LiquidOBMissingCode(curveKernel);
        CURVE_KERNEL = ILiquidOBCurveKernel(curveKernel);
    }

    function _liquidCurve(Context memory ctx, bytes calldata args) internal {
        if (args.length != 0) revert LiquidOBInvalidInstructionArguments(args.length);

        PositionConfig memory config = _decodeContextConfig(ctx);
        CurveSide side = _resolveSide(config, ctx.query.tokenIn, ctx.query.tokenOut);
        ExecutionMetadata memory metadata = _consumeExecutionMetadata(ctx);
        (PositionQuote memory positionQuote, CurveBranch branch) = _quotePosition(
            config,
            ctx.query.maker,
            ctx.query.orderHash,
            side,
            metadata.expectedVersion,
            ctx.query.isExactIn ? QuoteKind.ExactInput : QuoteKind.ExactOutput,
            ctx.query.isExactIn ? ctx.swap.amountIn : ctx.swap.amountOut,
            ctx.swap.balanceOut
        );

        ctx.swap.amountIn = positionQuote.curve.amountIn;
        ctx.swap.amountOut = positionQuote.curve.amountOut;

        if (ctx.vm.isStaticContext) return;

        if (!positionQuote.beforeState.initialized) {
            _emitRuntimeInitialized(positionQuote, config, ctx.query.maker);
        }
        _positionRuntimes[positionQuote.positionKey] = positionQuote.afterState;
        _emitCurveFilled(ctx, positionQuote, branch, metadata);
    }

    function _quotePosition(
        PositionConfig memory config,
        address maker,
        bytes32 strategyHash,
        CurveSide side,
        uint64 expectedVersion,
        QuoteKind kind,
        uint256 rawAmount,
        uint256 outputBalanceRaw
    ) internal view returns (PositionQuote memory positionQuote, CurveBranch branch) {
        bytes32 key = PositionCodec.positionKey(maker, strategyHash);
        return CURVE_KERNEL.quotePosition(
            config,
            _positionRuntimes[key],
            maker,
            strategyHash,
            side,
            expectedVersion,
            kind,
            rawAmount,
            outputBalanceRaw
        );
    }

    function _decodeOrderConfig(ISwapVM.Order calldata order) internal view returns (PositionConfig memory) {
        bytes calldata program = order.traits.program(order.data);
        return _decodePayloadBefore(program);
    }

    function _runtime(bytes32 positionKey) internal view returns (PositionRuntime memory) {
        return _positionRuntimes[positionKey];
    }

    function _decodeContextConfig(Context memory ctx) private view returns (PositionConfig memory) {
        return _decodePayloadBefore(ctx.program());
    }

    function _decodePayloadBefore(bytes calldata program) private view returns (PositionConfig memory config) {
        uint256 programOffset;
        assembly ("memory-safe") {
            programOffset := program.offset
        }
        if (programOffset < POSITION_PAYLOAD_LENGTH) {
            revert LiquidOBInvalidInstructionArguments(program.length);
        }

        bytes calldata payload;
        assembly ("memory-safe") {
            payload.offset := sub(programOffset, POSITION_PAYLOAD_LENGTH)
            payload.length := POSITION_PAYLOAD_LENGTH
        }
        config = CURVE_KERNEL.decodePosition(payload);
    }

    function _resolveSide(PositionConfig memory config, address tokenIn, address tokenOut)
        private
        pure
        returns (CurveSide side)
    {
        if (tokenIn == config.quoteToken && tokenOut == config.baseToken) return CurveSide.Sell;
        if (tokenIn == config.baseToken && tokenOut == config.quoteToken) return CurveSide.Buy;
        revert LiquidOBInvalidDirection(CurveSide.Sell, tokenIn, tokenOut);
    }

    function _consumeExecutionMetadata(Context memory ctx) private pure returns (ExecutionMetadata memory metadata) {
        bytes calldata encoded = ctx.tryChopTakerArgs(8);
        if (encoded.length != 8) revert LiquidOBInvalidExpectedVersionLength(encoded.length);
        assembly ("memory-safe") {
            mstore(metadata, shr(192, calldataload(encoded.offset)))
        }

        bytes calldata routeData = ctx.tryChopTakerArgs(74);
        if (routeData.length == 0) {
            metadata.payer = ctx.query.taker;
            metadata.recipient = ctx.query.taker;
            return metadata;
        }
        if (routeData.length != 74) revert LiquidOBInvalidInstructionArguments(routeData.length);
        assembly ("memory-safe") {
            mstore(add(metadata, 0x20), calldataload(routeData.offset))
            mstore(add(metadata, 0x40), shr(240, calldataload(add(routeData.offset, 32))))
            mstore(add(metadata, 0x60), shr(96, calldataload(add(routeData.offset, 34))))
            mstore(add(metadata, 0x80), shr(96, calldataload(add(routeData.offset, 54))))
        }
    }

    function _emitRuntimeInitialized(PositionQuote memory quote, PositionConfig memory config, address maker) private {
        emit PositionRuntimeInitialized(
            quote.positionKey,
            quote.marketId,
            maker,
            quote.strategyHash,
            AmountWad.unwrap(config.sell.initialReserve),
            AmountWad.unwrap(config.sell.initialReserve),
            AmountWad.unwrap(config.buy.initialReserve),
            AmountWad.unwrap(config.buy.initialReserve),
            0
        );
    }

    function _emitCurveFilled(
        Context memory ctx,
        PositionQuote memory quote,
        CurveBranch branch,
        ExecutionMetadata memory metadata
    ) private {
        bytes32 routeId = metadata.routeId == bytes32(0)
            ? keccak256(abi.encode(ctx.query.orderHash, ctx.query.taker, quote.beforeState.version))
            : metadata.routeId;
        emit CurveFilled(
            routeId,
            quote.positionKey,
            ctx.query.maker,
            quote.marketId,
            quote.strategyHash,
            metadata.fillIndex,
            quote.curve.side,
            branch,
            quote.curve.kind,
            metadata.payer,
            metadata.recipient,
            ctx.query.tokenIn,
            ctx.query.tokenOut,
            quote.curve.amountIn,
            quote.curve.amountOut,
            RateWad.unwrap(quote.curve.nativeRateBefore),
            RateWad.unwrap(quote.curve.nativeRateAfter),
            RateWad.unwrap(quote.curve.nativeEffectiveRate),
            PriceWad.unwrap(quote.curve.displayedPriceBefore),
            PriceWad.unwrap(quote.curve.displayedPriceAfter),
            PriceWad.unwrap(quote.curve.displayedEffectivePrice),
            AmountWad.unwrap(quote.beforeState.sell.y),
            AmountWad.unwrap(quote.beforeState.sell.yInt),
            AmountWad.unwrap(quote.beforeState.buy.y),
            AmountWad.unwrap(quote.beforeState.buy.yInt),
            quote.beforeState.version,
            AmountWad.unwrap(quote.afterState.sell.y),
            AmountWad.unwrap(quote.afterState.sell.yInt),
            AmountWad.unwrap(quote.afterState.buy.y),
            AmountWad.unwrap(quote.afterState.buy.yInt),
            quote.afterState.version
        );
    }
}
