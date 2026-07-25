// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB custom instruction added on 25 July 2026.

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {MakerTraitsLib, MakerTraits} from "@1inch/swap-vm/src/libs/MakerTraits.sol";
import {Context, ContextLib} from "@1inch/swap-vm/src/libs/VM.sol";

import {ILiquidOBEvents} from "../interfaces/ILiquidOBEvents.sol";
import {
    AmountWad,
    CurveBranch,
    CurveConfig,
    CurveQuote,
    CurveSide,
    CurveState,
    CurveTypesLib,
    NativeCurve,
    PriceWad,
    QuoteKind,
    RateWad,
    Rounding
} from "../types/CurveTypes.sol";
import {PositionConfig, PositionQuote, PositionRuntime} from "../types/PositionTypes.sol";
import {
    LiquidOBInsufficientAquaBalance,
    LiquidOBInvalidDirection,
    LiquidOBInvalidExpectedVersionLength,
    LiquidOBInvalidInstructionArguments,
    LiquidOBPositionExhausted,
    LiquidOBStalePositionVersion
} from "../types/ProtocolErrors.sol";
import {CurveCompiler} from "../libraries/CurveCompiler.sol";
import {CurveMath} from "../libraries/CurveMath.sol";
import {FullPrecisionMath} from "../libraries/FullPrecisionMath.sol";
import {PositionCodec} from "../libraries/PositionCodec.sol";
import {PositionMath} from "../libraries/PositionMath.sol";

/// @notice SwapVM instruction that quotes and atomically materializes one Liquid OB fill.
abstract contract LiquidCurveInstruction is ILiquidOBEvents {
    using ContextLib for Context;
    using MakerTraitsLib for MakerTraits;

    uint256 internal constant POSITION_PAYLOAD_LENGTH = 269;

    mapping(bytes32 positionKey => PositionRuntime runtime) internal _positionRuntimes;

    function _liquidCurve(Context memory ctx, bytes calldata args) internal {
        if (args.length != 0) revert LiquidOBInvalidInstructionArguments(args.length);

        PositionConfig memory config = _decodeContextConfig(ctx);
        CurveSide side = _resolveSide(config, ctx.query.tokenIn, ctx.query.tokenOut);
        uint64 expectedVersion = _consumeExpectedVersion(ctx);
        (PositionQuote memory positionQuote, CurveBranch branch) = _quotePosition(
            config,
            ctx.query.maker,
            ctx.query.orderHash,
            side,
            expectedVersion,
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
        _emitCurveFilled(ctx, positionQuote, branch);
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
        PositionRuntime memory beforeState = PositionMath.resolve(config, _positionRuntimes[key]);
        if (expectedVersion != beforeState.version) {
            revert LiquidOBStalePositionVersion(expectedVersion, beforeState.version);
        }

        CurveConfig memory activeConfig = side == CurveSide.Sell ? config.sell : config.buy;
        CurveState memory activeState = side == CurveSide.Sell ? beforeState.sell : beforeState.buy;
        if (AmountWad.unwrap(activeState.y) == 0) revert LiquidOBPositionExhausted(strategyHash, side);

        NativeCurve memory nativeCurve = CurveCompiler.compile(activeConfig, side);
        branch = nativeCurve.branch;
        address tokenIn = CurveTypesLib.tokenIn(side, config.baseToken, config.quoteToken);
        address tokenOut = CurveTypesLib.tokenOut(side, config.baseToken, config.quoteToken);
        uint8 inputDecimals = IERC20Metadata(tokenIn).decimals();
        uint8 outputDecimals = IERC20Metadata(tokenOut).decimals();
        CurveQuote memory curveQuote;

        if (kind == QuoteKind.ExactInput) {
            AmountWad amountInWad = FullPrecisionMath.rawToWad(tokenIn, rawAmount, inputDecimals);
            CurveQuote memory preliminary = CurveMath.quoteExactInput(nativeCurve, activeState, side, amountInWad);
            uint256 amountOut =
                FullPrecisionMath.wadToRaw(tokenOut, preliminary.amountOutWad, outputDecimals, Rounding.Down);
            AmountWad amountOutWad = FullPrecisionMath.rawToWad(tokenOut, amountOut, outputDecimals);
            CurveQuote memory transferable = AmountWad.unwrap(amountOutWad)
                == AmountWad.unwrap(preliminary.amountOutWad)
                ? preliminary
                : CurveMath.quoteExactOutput(nativeCurve, activeState, side, amountOutWad);
            curveQuote = CurveMath.withTransferAmounts(
                transferable, kind, side, rawAmount, amountOut, amountInWad, amountOutWad
            );
        } else {
            AmountWad amountOutWad = FullPrecisionMath.rawToWad(tokenOut, rawAmount, outputDecimals);
            CurveQuote memory preliminary = CurveMath.quoteExactOutput(nativeCurve, activeState, side, amountOutWad);
            uint256 amountIn = FullPrecisionMath.wadToRaw(tokenIn, preliminary.amountInWad, inputDecimals, Rounding.Up);
            AmountWad amountInWad = FullPrecisionMath.rawToWad(tokenIn, amountIn, inputDecimals);
            curveQuote =
                CurveMath.withTransferAmounts(preliminary, kind, side, amountIn, rawAmount, amountInWad, amountOutWad);
        }

        if (curveQuote.amountOut > outputBalanceRaw) {
            revert LiquidOBInsufficientAquaBalance(curveQuote.amountOut, outputBalanceRaw);
        }

        positionQuote = PositionQuote({
            marketId: PositionCodec.marketId(config.baseToken, config.quoteToken),
            positionKey: key,
            strategyHash: strategyHash,
            curve: curveQuote,
            beforeState: beforeState,
            afterState: PositionMath.transition(beforeState, side, curveQuote)
        });
    }

    function _decodeOrderConfig(ISwapVM.Order calldata order) internal pure returns (PositionConfig memory) {
        bytes calldata program = order.traits.program(order.data);
        return _decodePayloadBefore(program);
    }

    function _runtime(bytes32 positionKey) internal view returns (PositionRuntime memory) {
        return _positionRuntimes[positionKey];
    }

    function _decodeContextConfig(Context memory ctx) private pure returns (PositionConfig memory) {
        return _decodePayloadBefore(ctx.program());
    }

    function _decodePayloadBefore(bytes calldata program) private pure returns (PositionConfig memory config) {
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
        config = PositionCodec.decode(payload);
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

    function _consumeExpectedVersion(Context memory ctx) private pure returns (uint64 expectedVersion) {
        bytes calldata encoded = ctx.tryChopTakerArgs(8);
        if (encoded.length != 8) revert LiquidOBInvalidExpectedVersionLength(encoded.length);
        assembly ("memory-safe") {
            expectedVersion := shr(192, calldataload(encoded.offset))
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

    function _emitCurveFilled(Context memory ctx, PositionQuote memory quote, CurveBranch branch) private {
        bytes32 routeId = keccak256(abi.encode(ctx.query.orderHash, ctx.query.taker, quote.beforeState.version));
        emit CurveFilled(
            routeId,
            quote.positionKey,
            ctx.query.maker,
            quote.marketId,
            quote.strategyHash,
            0,
            quote.curve.side,
            branch,
            quote.curve.kind,
            ctx.query.taker,
            ctx.query.taker,
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
