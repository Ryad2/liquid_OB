// SPDX-License-Identifier: LicenseRef-Degensoft-SwapVM-1.1
pragma solidity 0.8.30;

/// @custom:license-url https://github.com/1inch/swap-vm/blob/release/1.1/LICENSES/SwapVM-1.1.txt
/// @custom:copyright © 2025 Degensoft Ltd
/// @custom:notice Liquid OB test extension added on 25 July 2026.

import {AquaSwapVMRouter} from "@1inch/swap-vm/src/routers/AquaSwapVMRouter.sol";
import {Context} from "@1inch/swap-vm/src/libs/VM.sol";

abstract contract FixedRateSmokeInstruction {
    error SmokeArgumentsNotEmpty();
    error SmokeInsufficientOutputLiquidity(uint256 requested, uint256 available);

    function _oneToOne(Context memory ctx, bytes calldata args) internal pure {
        require(args.length == 0, SmokeArgumentsNotEmpty());

        if (ctx.query.isExactIn) {
            ctx.swap.amountOut = ctx.swap.amountIn;
        } else {
            ctx.swap.amountIn = ctx.swap.amountOut;
        }

        require(
            ctx.swap.amountOut <= ctx.swap.balanceOut,
            SmokeInsufficientOutputLiquidity(ctx.swap.amountOut, ctx.swap.balanceOut)
        );
    }
}

/// @notice Disposable router used only to prove the pinned Aqua/SwapVM boundary.
contract FixedRateSmokeRouter is AquaSwapVMRouter, FixedRateSmokeInstruction {
    constructor(address aqua, address owner)
        AquaSwapVMRouter(aqua, address(0), owner, "Liquid OB Phase 1 Smoke", "1")
    {}

    function smokeOpcode() external pure returns (uint8) {
        return uint8(super._opcodes().length);
    }

    function _opcodes()
        internal
        pure
        override
        returns (function(Context memory, bytes calldata) internal[] memory result)
    {
        function(Context memory, bytes calldata) internal[] memory upstream = super._opcodes();
        result = new function(Context memory, bytes calldata) internal[](upstream.length + 1);

        for (uint256 i = 0; i < upstream.length; ++i) {
            result[i] = upstream[i];
        }
        result[upstream.length] = FixedRateSmokeInstruction._oneToOne;
    }
}
