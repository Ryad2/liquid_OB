// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {ILiquidOBCurveKernel} from "../interfaces/ILiquidOBCurveKernel.sol";
import {
    AmountWad,
    CurveBranch,
    CurveConfig,
    CurveQuote,
    CurveSide,
    CurveState,
    CurveTypesLib,
    NativeCurve,
    QuoteKind,
    Rounding
} from "../types/CurveTypes.sol";
import {PositionConfig, PositionQuote, PositionRuntime} from "../types/PositionTypes.sol";
import {
    LiquidOBInsufficientAquaBalance,
    LiquidOBPositionExhausted,
    LiquidOBStalePositionVersion
} from "../types/ProtocolErrors.sol";
import {CurveCompiler} from "../libraries/CurveCompiler.sol";
import {CurveMath} from "../libraries/CurveMath.sol";
import {FullPrecisionMath} from "../libraries/FullPrecisionMath.sol";
import {PositionCodec} from "../libraries/PositionCodec.sol";
import {PositionMath} from "../libraries/PositionMath.sol";

/// @notice Stateless executable curve kernel separated from the router to satisfy EIP-170.
contract LiquidOBCurveKernel is ILiquidOBCurveKernel {
    function deriveCurve(CurveConfig calldata config, CurveSide side) external pure returns (CurveConfig memory) {
        return CurveCompiler.derive(config, side);
    }

    function encodePosition(PositionConfig calldata config) external pure returns (bytes memory) {
        return PositionCodec.encode(config);
    }

    function decodePosition(bytes calldata payload) external pure returns (PositionConfig memory) {
        return PositionCodec.decode(payload);
    }

    function resolveRuntime(PositionConfig calldata config, PositionRuntime calldata storedRuntime)
        external
        pure
        returns (PositionRuntime memory)
    {
        return PositionMath.resolve(config, storedRuntime);
    }

    function quotePosition(
        PositionConfig calldata config,
        PositionRuntime calldata storedRuntime,
        address maker,
        bytes32 strategyHash,
        CurveSide side,
        uint64 expectedVersion,
        QuoteKind kind,
        uint256 rawAmount,
        uint256 outputBalanceRaw
    ) external view returns (PositionQuote memory positionQuote, CurveBranch branch) {
        bytes32 key = PositionCodec.positionKey(maker, strategyHash);
        PositionRuntime memory beforeState = PositionMath.resolve(config, storedRuntime);
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
}
