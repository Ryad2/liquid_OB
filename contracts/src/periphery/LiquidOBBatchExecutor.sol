// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

import {ISwapVM} from "@1inch/swap-vm/src/interfaces/ISwapVM.sol";
import {TakerTraitsLib} from "@1inch/swap-vm/src/libs/TakerTraits.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {ILiquidOBBatchExecutor} from "../interfaces/ILiquidOBBatchExecutor.sol";
import {CurveTypesLib, QuoteKind} from "../types/CurveTypes.sol";
import {PositionConfig} from "../types/PositionTypes.sol";
import {ExactInputRoute, ExactOutputRoute, FillRequest, RouteResult} from "../types/RouteTypes.sol";
import {
    LiquidOBDeadlineExpired,
    LiquidOBDuplicatePosition,
    LiquidOBMakerMismatch,
    LiquidOBMarketMismatch,
    LiquidOBRouteAmountMismatch,
    LiquidOBSlippageExceeded,
    LiquidOBStrategyHashMismatch,
    LiquidOBTooManyFills,
    LiquidOBZeroAddress,
    LiquidOBZeroAmount
} from "../types/ProtocolErrors.sol";
import {PositionCodec} from "../libraries/PositionCodec.sol";
import {LiquidOBSwapVMRouter} from "../core/LiquidOBSwapVMRouter.sol";

/// @notice Executes one bounded, solver-selected route atomically across maker strategies.
contract LiquidOBBatchExecutor is ILiquidOBBatchExecutor, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 private constant ROUTE_TYPEHASH =
        keccak256("LiquidOBRoute(uint256 chainId,address executor,address payer,bytes32 salt,uint8 kind)");

    LiquidOBSwapVMRouter public immutable ROUTER;
    uint16 public immutable MAX_FILLS;

    constructor(address router, uint16 maxFills) {
        if (router == address(0)) revert LiquidOBZeroAddress();
        if (maxFills == 0) revert LiquidOBTooManyFills(0, 0);
        ROUTER = LiquidOBSwapVMRouter(payable(router));
        MAX_FILLS = maxFills;
    }

    function executeExactInput(ExactInputRoute calldata route)
        external
        nonReentrant
        returns (RouteResult memory result)
    {
        _validateCommon(
            route.baseToken,
            route.quoteToken,
            route.recipient,
            route.refundRecipient,
            route.deadline,
            route.fills.length
        );
        if (route.amountIn == 0) revert LiquidOBZeroAmount();
        (ISwapVM.Order[] memory orders, uint256 proposedInput) =
            _validateFills(route.fills, route.baseToken, route.quoteToken);
        if (proposedInput != route.amountIn) {
            revert LiquidOBRouteAmountMismatch(route.amountIn, proposedInput);
        }

        bytes32 routeId = _routeId(route.salt, QuoteKind.ExactInput);
        address tokenIn = CurveTypesLib.tokenIn(route.side, route.baseToken, route.quoteToken);
        address tokenOut = CurveTypesLib.tokenOut(route.side, route.baseToken, route.quoteToken);
        IERC20 inputToken = IERC20(tokenIn);
        uint256 balanceBefore = inputToken.balanceOf(address(this));
        inputToken.safeTransferFrom(msg.sender, address(this), route.amountIn);
        _requireFunding(inputToken, balanceBefore, route.amountIn);
        inputToken.forceApprove(address(ROUTER), route.amountIn);

        for (uint256 i; i < route.fills.length; ++i) {
            (uint256 amountIn, uint256 amountOut,) = ROUTER.swap(
                orders[i],
                tokenIn,
                tokenOut,
                route.fills[i].amount,
                _takerTraits(
                    true,
                    route.recipient,
                    route.deadline,
                    route.fills[i].expectedVersion,
                    routeId,
                    _fillIndex(i),
                    msg.sender
                )
            );
            if (amountIn != route.fills[i].amount) {
                revert LiquidOBRouteAmountMismatch(route.fills[i].amount, amountIn);
            }
            result.amountIn += amountIn;
            result.amountOut += amountOut;
        }

        if (result.amountOut < route.minAmountOut) {
            revert LiquidOBSlippageExceeded(result.amountOut, route.minAmountOut);
        }
        _refundAndClear(inputToken, balanceBefore, route.refundRecipient);
        result.routeId = routeId;
        result.fillCount = uint16(route.fills.length);
        emit RouteExecuted(
            routeId,
            PositionCodec.marketId(route.baseToken, route.quoteToken),
            msg.sender,
            route.recipient,
            route.refundRecipient,
            route.side,
            QuoteKind.ExactInput,
            tokenIn,
            tokenOut,
            result.amountIn,
            result.amountOut,
            route.minAmountOut,
            result.fillCount
        );
    }

    function executeExactOutput(ExactOutputRoute calldata route)
        external
        nonReentrant
        returns (RouteResult memory result)
    {
        _validateCommon(
            route.baseToken,
            route.quoteToken,
            route.recipient,
            route.refundRecipient,
            route.deadline,
            route.fills.length
        );
        if (route.amountOut == 0 || route.maxAmountIn == 0) revert LiquidOBZeroAmount();
        (ISwapVM.Order[] memory orders, uint256 proposedOutput) =
            _validateFills(route.fills, route.baseToken, route.quoteToken);
        if (proposedOutput != route.amountOut) {
            revert LiquidOBRouteAmountMismatch(route.amountOut, proposedOutput);
        }

        bytes32 routeId = _routeId(route.salt, QuoteKind.ExactOutput);
        address tokenIn = CurveTypesLib.tokenIn(route.side, route.baseToken, route.quoteToken);
        address tokenOut = CurveTypesLib.tokenOut(route.side, route.baseToken, route.quoteToken);
        IERC20 inputToken = IERC20(tokenIn);
        uint256 balanceBefore = inputToken.balanceOf(address(this));
        inputToken.safeTransferFrom(msg.sender, address(this), route.maxAmountIn);
        _requireFunding(inputToken, balanceBefore, route.maxAmountIn);
        inputToken.forceApprove(address(ROUTER), route.maxAmountIn);

        for (uint256 i; i < route.fills.length; ++i) {
            (uint256 amountIn, uint256 amountOut,) = ROUTER.swap(
                orders[i],
                tokenIn,
                tokenOut,
                route.fills[i].amount,
                _takerTraits(
                    false,
                    route.recipient,
                    route.deadline,
                    route.fills[i].expectedVersion,
                    routeId,
                    _fillIndex(i),
                    msg.sender
                )
            );
            if (amountOut != route.fills[i].amount) {
                revert LiquidOBRouteAmountMismatch(route.fills[i].amount, amountOut);
            }
            result.amountIn += amountIn;
            result.amountOut += amountOut;
        }

        if (result.amountIn > route.maxAmountIn) {
            revert LiquidOBSlippageExceeded(result.amountIn, route.maxAmountIn);
        }
        _refundAndClear(inputToken, balanceBefore, route.refundRecipient);
        result.routeId = routeId;
        result.fillCount = uint16(route.fills.length);
        emit RouteExecuted(
            routeId,
            PositionCodec.marketId(route.baseToken, route.quoteToken),
            msg.sender,
            route.recipient,
            route.refundRecipient,
            route.side,
            QuoteKind.ExactOutput,
            tokenIn,
            tokenOut,
            result.amountIn,
            result.amountOut,
            route.maxAmountIn,
            result.fillCount
        );
    }

    function _validateFills(FillRequest[] calldata fills, address baseToken, address quoteToken)
        private
        view
        returns (ISwapVM.Order[] memory orders, uint256 proposedAmount)
    {
        orders = new ISwapVM.Order[](fills.length);
        bytes32[] memory keys = new bytes32[](fills.length);

        for (uint256 i; i < fills.length; ++i) {
            FillRequest calldata fill = fills[i];
            if (fill.amount == 0) revert LiquidOBZeroAmount();
            bytes32 exactHash = PositionCodec.hashStrategy(fill.strategy);
            if (exactHash != fill.strategyHash) {
                revert LiquidOBStrategyHashMismatch(fill.strategyHash, exactHash);
            }
            ISwapVM.Order memory order = abi.decode(fill.strategy, (ISwapVM.Order));
            if (order.maker != fill.maker) revert LiquidOBMakerMismatch(fill.maker, order.maker);
            bytes32 routerHash = ROUTER.hash(order);
            if (routerHash != exactHash) revert LiquidOBStrategyHashMismatch(exactHash, routerHash);
            PositionConfig memory config = ROUTER.decodePosition(order);
            if (config.baseToken != baseToken || config.quoteToken != quoteToken) {
                revert LiquidOBMarketMismatch(baseToken, quoteToken, config.baseToken, config.quoteToken);
            }

            bytes32 key = PositionCodec.positionKey(fill.maker, exactHash);
            for (uint256 j; j < i; ++j) {
                if (keys[j] == key) revert LiquidOBDuplicatePosition(key);
            }
            keys[i] = key;
            orders[i] = order;
            proposedAmount += fill.amount;
        }
    }

    function _validateCommon(
        address baseToken,
        address quoteToken,
        address recipient,
        address refundRecipient,
        uint40 deadline,
        uint256 fillCount
    ) private view {
        PositionCodec.marketId(baseToken, quoteToken);
        if (recipient == address(0) || refundRecipient == address(0)) revert LiquidOBZeroAddress();
        if (block.timestamp > deadline) revert LiquidOBDeadlineExpired(deadline, block.timestamp);
        if (fillCount == 0 || fillCount > MAX_FILLS) revert LiquidOBTooManyFills(fillCount, MAX_FILLS);
    }

    function _takerTraits(
        bool exactInput,
        address recipient,
        uint40 deadline,
        uint64 expectedVersion,
        bytes32 routeId,
        uint16 fillIndex,
        address payer
    ) private view returns (bytes memory) {
        return TakerTraitsLib.build(
            TakerTraitsLib.Args({
                taker: address(this),
                isExactIn: exactInput,
                shouldUnwrapWeth: false,
                isStrictThresholdAmount: false,
                isFirstTransferFromTaker: false,
                useTransferFromAndAquaPush: true,
                threshold: "",
                to: recipient,
                deadline: deadline,
                hasPreTransferInCallback: false,
                hasPreTransferOutCallback: false,
                preTransferInHookData: "",
                postTransferInHookData: "",
                preTransferOutHookData: "",
                postTransferOutHookData: "",
                preTransferInCallbackData: "",
                preTransferOutCallbackData: "",
                instructionsArgs: abi.encodePacked(expectedVersion, routeId, fillIndex, payer, recipient),
                signature: ""
            })
        );
    }

    function _routeId(bytes32 salt, QuoteKind kind) private view returns (bytes32) {
        return keccak256(abi.encode(ROUTE_TYPEHASH, block.chainid, address(this), msg.sender, salt, kind));
    }

    function _fillIndex(uint256 index) private pure returns (uint16) {
        // `index < fills.length <= MAX_FILLS`, and MAX_FILLS is uint16.
        // forge-lint: disable-next-line(unsafe-typecast)
        return uint16(index);
    }

    function _requireFunding(IERC20 token, uint256 balanceBefore, uint256 expected) private view {
        uint256 received = token.balanceOf(address(this)) - balanceBefore;
        if (received != expected) revert LiquidOBRouteAmountMismatch(expected, received);
    }

    function _refundAndClear(IERC20 token, uint256 balanceBefore, address refundRecipient) private {
        token.forceApprove(address(ROUTER), 0);
        uint256 balanceAfter = token.balanceOf(address(this));
        if (balanceAfter > balanceBefore) token.safeTransfer(refundRecipient, balanceAfter - balanceBefore);
    }
}
