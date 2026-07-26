// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity 0.8.30;

/// @notice Displayed quote-token units per one base-token unit, scaled by 1e18.
type PriceWad is uint128;

/// @notice Native outgoing-token units per incoming-token unit, scaled by 1e18.
type RateWad is uint128;

/// @notice Token amount normalized to 18 decimals, scaled by 1e18.
type AmountWad is uint128;

/// @notice Dimensionless value scaled by 1e18.
type UnitlessWad is uint128;

/// @notice Signed maker-facing Holder parameter scaled by 1e18.
type AlphaWad is int128;

/// @notice Maker curve that releases base (`Sell`) or quote (`Buy`).
enum CurveSide {
    Sell,
    Buy
}

/// @notice Whether the caller fixes the incoming or outgoing token amount.
enum QuoteKind {
    ExactInput,
    ExactOutput
}

/// @notice Internal mathematical branch selected from immutable parameters.
enum CurveBranch {
    General,
    NativeAlphaZero,
    NativeAlphaOne,
    Flat
}

/// @notice Explicit integer rounding direction.
enum Rounding {
    Down,
    Up
}

/// @notice Immutable maker-facing curve parameters plus native commitments.
/// @param startPrice Displayed quote/base marginal price at fresh progress zero, WAD.
/// @param endPrice Displayed quote/base terminal marginal price, WAD.
/// @param alpha Maker-facing signed Holder parameter, WAD.
/// @param initialReserve Initial outgoing-token reserve normalized to WAD.
/// @param mu Native dimensionless range commitment, WAD; zero only for flat curves.
/// @param kappa Native output/input rate-scale commitment, WAD; flat native rate for flat curves.
struct CurveConfig {
    PriceWad startPrice;
    PriceWad endPrice;
    AlphaWad alpha;
    AmountWad initialReserve;
    UnitlessWad mu;
    RateWad kappa;
}

/// @notice Mutable state of one directional curve.
/// @param y Live logical outgoing-token reserve normalized to WAD.
/// @param yInt Mutable outgoing-token domain scale normalized to WAD.
struct CurveState {
    AmountWad y;
    AmountWad yInt;
}

/// @notice Maker policy compiled into the native outgoing-per-incoming frame.
/// @param branch Exact numerical branch used by the curve kernel.
/// @param alphaNative Native Holder parameter in signed WAD.
/// @param betaNative Derived conjugate parameter `alphaNative - 1`, signed WAD.
/// @param pLow Terminal native output/input marginal rate, WAD.
/// @param pHigh Fresh native output/input marginal rate, WAD.
/// @param mu Dimensionless reduced range parameter, WAD.
/// @param kappa Native reduced scale parameter, WAD.
struct NativeCurve {
    CurveBranch branch;
    int256 alphaNative;
    int256 betaNative;
    RateWad pLow;
    RateWad pHigh;
    UnitlessWad mu;
    RateWad kappa;
}

/// @notice Complete pure quote for one active curve.
/// @param kind Exact-input or exact-output request semantics.
/// @param side Maker side consumed by the taker.
/// @param amountIn Raw incoming-token units using the token's native decimals.
/// @param amountOut Raw outgoing-token units using the token's native decimals.
/// @param amountInWad Incoming amount normalized to WAD.
/// @param amountOutWad Outgoing amount normalized to WAD.
/// @param nativeRateBefore Native marginal output/input rate before the fill, WAD.
/// @param nativeRateAfter Native marginal output/input rate after the fill, WAD.
/// @param nativeEffectiveRate Native secant output/input rate for the fill, WAD.
/// @param displayedPriceBefore Displayed quote/base marginal price before the fill, WAD.
/// @param displayedPriceAfter Displayed quote/base marginal price after the fill, WAD.
/// @param displayedEffectivePrice Displayed quote/base secant price for the fill, WAD.
/// @param activeBefore Active directional state before the fill, WAD amounts.
/// @param activeAfter Active directional state after the fill, WAD amounts.
struct CurveQuote {
    QuoteKind kind;
    CurveSide side;
    uint256 amountIn;
    uint256 amountOut;
    AmountWad amountInWad;
    AmountWad amountOutWad;
    RateWad nativeRateBefore;
    RateWad nativeRateAfter;
    RateWad nativeEffectiveRate;
    PriceWad displayedPriceBefore;
    PriceWad displayedPriceAfter;
    PriceWad displayedEffectivePrice;
    CurveState activeBefore;
    CurveState activeAfter;
}

/// @notice Unit constants and direction helpers shared by all protocol layers.
library CurveTypesLib {
    uint256 internal constant WAD = 1e18;
    uint8 internal constant WAD_DECIMALS = 18;
    uint8 internal constant MAX_SUPPORTED_TOKEN_DECIMALS = 18;
    int128 internal constant MIN_ALPHA_WAD = -type(int128).max;
    int128 internal constant MAX_ALPHA_WAD = type(int128).max;

    /// @notice Returns the native signed alpha in WAD without narrowing it.
    function nativeAlphaWad(CurveConfig memory config, CurveSide side) internal pure returns (int256) {
        int256 alpha = int256(AlphaWad.unwrap(config.alpha));
        return side == CurveSide.Sell ? -alpha : alpha;
    }

    /// @notice Classifies a structurally valid curve without evaluating math.
    function branch(CurveConfig memory config, CurveSide side) internal pure returns (CurveBranch) {
        if (PriceWad.unwrap(config.startPrice) == PriceWad.unwrap(config.endPrice)) {
            return CurveBranch.Flat;
        }

        int256 alphaNative = nativeAlphaWad(config, side);
        if (alphaNative == 0) return CurveBranch.NativeAlphaZero;
        if (alphaNative == 1e18) return CurveBranch.NativeAlphaOne;
        return CurveBranch.General;
    }

    /// @notice Returns the taker's incoming token for a maker side.
    function tokenIn(CurveSide side, address baseToken, address quoteToken) internal pure returns (address) {
        return side == CurveSide.Sell ? quoteToken : baseToken;
    }

    /// @notice Returns the taker's outgoing token for a maker side.
    function tokenOut(CurveSide side, address baseToken, address quoteToken) internal pure returns (address) {
        return side == CurveSide.Sell ? baseToken : quoteToken;
    }
}
