"""Deterministic scenario definitions and JSON-document builders."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .reference_math import (
    DECIMAL_PRECISION,
    SERIALIZED_DECIMAL_PLACES,
    WAD,
    NativeCurve,
    Quote,
    compile_curve,
    conjugate_marginal_rate,
    d_down,
    d_up,
    decimal,
    decimal_string,
    direct_integrated_x,
    displayed_holder_price,
    holder_price,
    native_holder_rate,
    native_marginal_rate,
    recover_y_int,
    reconstruct_bounds,
    recycle_inventory,
    split_path_cost,
    wad_rounding_interval,
    x_of_y,
    y_of_x,
    quote_exact_input,
    quote_exact_output,
)


IDENTITY_TOLERANCE = decimal("1e-66")


@dataclass(frozen=True)
class CurveScenario:
    identifier: str
    side: str
    start_price: str
    end_price: str
    alpha: str
    y_int: str
    y: str
    amount_out: str
    coverage: tuple[str, ...]


SCENARIOS: tuple[CurveScenario, ...] = (
    CurveScenario(
        "buy-positive-alpha-partial",
        "buy",
        "220",
        "80",
        "2",
        "1250",
        "1000",
        "175",
        ("maker-alpha-positive", "native-alpha-greater-than-one", "partial-fill", "buy-orientation"),
    ),
    CurveScenario(
        "buy-negative-alpha-full",
        "buy",
        "250",
        "90",
        "-2",
        "700",
        "700",
        "700",
        ("maker-alpha-negative", "native-alpha-negative", "full-fill", "reserve-exhaustion"),
    ),
    CurveScenario(
        "buy-alpha-zero-partial",
        "buy",
        "200",
        "100",
        "0",
        "1000",
        "650",
        "125",
        ("maker-alpha-zero", "native-alpha-zero", "geometric-marginal-path", "partial-fill"),
    ),
    CurveScenario(
        "buy-alpha-one-near-full",
        "buy",
        "180",
        "60",
        "1",
        "900",
        "900",
        "899.9999999999999991",
        ("native-alpha-one", "near-full-fill", "logarithmic-coordinate-branch"),
    ),
    CurveScenario(
        "buy-alpha-half-partial",
        "buy",
        "190",
        "70",
        "0.5",
        "840",
        "714",
        "147",
        ("native-alpha-between-zero-and-one", "partial-fill", "geometric-effective-checkpoint"),
    ),
    CurveScenario(
        "sell-positive-alpha-partial",
        "sell",
        "100",
        "240",
        "2",
        "50",
        "35",
        "7",
        ("maker-alpha-positive", "native-alpha-negative", "sell-reciprocity", "partial-fill"),
    ),
    CurveScenario(
        "sell-negative-one-native-one",
        "sell",
        "90",
        "210",
        "-1",
        "75",
        "67.5",
        "13.5",
        ("maker-alpha-negative", "native-alpha-one", "sell-reciprocity", "partial-fill"),
    ),
    CurveScenario(
        "sell-alpha-zero-near-empty",
        "sell",
        "110",
        "260",
        "0",
        "40",
        "0.0000000000000004",
        "0.0000000000000002",
        ("maker-alpha-zero", "native-alpha-zero", "near-empty-state", "sell-orientation"),
    ),
    CurveScenario(
        "flat-buy-full",
        "buy",
        "150",
        "150",
        "42",
        "3000",
        "600",
        "600",
        ("flat-order", "alpha-canonicalization", "full-fill", "buy-orientation"),
    ),
    CurveScenario(
        "flat-sell-partial",
        "sell",
        "125",
        "125",
        "-7",
        "24",
        "24",
        "6",
        ("flat-order", "alpha-canonicalization", "partial-fill", "sell-orientation"),
    ),
    CurveScenario(
        "buy-large-positive-alpha",
        "buy",
        "160",
        "120",
        "20",
        "500",
        "425",
        "85",
        ("large-positive-alpha", "native-alpha-greater-than-one", "safe-numerical-domain"),
    ),
    CurveScenario(
        "buy-large-negative-alpha",
        "buy",
        "160",
        "120",
        "-20",
        "500",
        "375",
        "75",
        ("large-negative-alpha", "native-alpha-negative", "safe-numerical-domain"),
    ),
    CurveScenario(
        "buy-alpha-immediately-above-zero",
        "buy",
        "175",
        "95",
        "0.000000000000000001",
        "640",
        "512",
        "64",
        ("near-native-alpha-zero", "fixed-point-neighbor", "continuity"),
    ),
    CurveScenario(
        "buy-alpha-immediately-above-one",
        "buy",
        "175",
        "95",
        "1.000000000000000001",
        "640",
        "512",
        "64",
        ("near-native-alpha-one", "fixed-point-neighbor", "continuity"),
    ),
)


def _assert_close(label: str, left: Any, right: Any, tolerance=IDENTITY_TOLERANCE) -> None:
    left_decimal = decimal(left)
    right_decimal = decimal(right)
    scale = max(decimal(1), abs(left_decimal), abs(right_decimal))
    if abs(left_decimal - right_decimal) > tolerance * scale:
        raise AssertionError(f"{label}: {left_decimal} != {right_decimal}")


def _real(value: Any) -> str:
    return decimal_string(decimal(value))


def _interval(value: Any, direction: str | None = None) -> dict[str, str]:
    result = wad_rounding_interval(decimal(value))
    if direction is not None:
        result = {"direction": direction, **result}
    return result


def _quote_document(quote: Quote) -> dict[str, Any]:
    return {
        "amount_in": _real(quote.amount_in),
        "amount_out": _real(quote.amount_out),
        "y_before": _real(quote.y_before),
        "y_after": _real(quote.y_after),
        "x_before": _real(quote.x_before),
        "x_after": _real(quote.x_after),
        "native_rate_before": _real(quote.native_rate_before),
        "native_rate_after": _real(quote.native_rate_after),
        "native_effective_rate": _real(quote.native_effective_rate),
        "displayed_price_before": _real(quote.displayed_price_before),
        "displayed_price_after": _real(quote.displayed_price_after),
        "displayed_effective_price": _real(quote.displayed_effective_price),
    }


def _compiled_document(curve: NativeCurve) -> dict[str, Any]:
    return {
        "side": curve.side,
        "alpha_displayed": _real(curve.alpha_displayed),
        "alpha_native": _real(curve.alpha_native),
        "beta_native": _real(curve.beta_native),
        "p_high": _real(curve.p_high),
        "p_low": _real(curve.p_low),
        "mu": _real(curve.mu),
        "kappa": _real(curve.kappa),
        "branch": curve.branch,
        "wire_rounding_intervals": {
            "alpha_native_signed_wad": _interval(curve.alpha_native),
            "p_high_unsigned_wad": _interval(curve.p_high),
            "p_low_unsigned_wad": _interval(curve.p_low),
            "mu_unsigned_wad": _interval(curve.mu),
            "kappa_unsigned_wad": _interval(curve.kappa),
        },
    }


def build_curve_vector(scenario: CurveScenario) -> dict[str, Any]:
    start_price = decimal(scenario.start_price)
    end_price = decimal(scenario.end_price)
    alpha = decimal(scenario.alpha)
    y_int = decimal(scenario.y_int)
    y = decimal(scenario.y)
    amount_out = decimal(scenario.amount_out)
    curve = compile_curve(scenario.side, start_price, end_price, alpha)

    quote_out = quote_exact_output(curve, y, y_int, amount_out)
    quote_in = quote_exact_input(curve, y, y_int, quote_out.amount_in)
    progress_before = decimal(1) - y / y_int
    progress_after = decimal(1) - quote_out.y_after / y_int

    direct_native_before = native_holder_rate(curve, progress_before)
    direct_native_after = native_holder_rate(curve, progress_after)
    direct_displayed_before = holder_price(start_price, end_price, alpha, progress_before)
    direct_displayed_after = holder_price(start_price, end_price, alpha, progress_after)
    compiled_displayed_before = displayed_holder_price(curve, progress_before)
    compiled_displayed_after = displayed_holder_price(curve, progress_after)

    reduced_x_before = x_of_y(curve, y, y_int)
    reduced_x_after = x_of_y(curve, quote_out.y_after, y_int)
    integral_x_before = direct_integrated_x(curve, y_int, progress_before)
    integral_x_after = direct_integrated_x(curve, y_int, progress_after)
    inverse_y_before = y_of_x(curve, reduced_x_before, y_int)
    inverse_y_after = y_of_x(curve, reduced_x_after, y_int)
    conjugate_rate_before = conjugate_marginal_rate(curve, reduced_x_before, y_int)
    conjugate_rate_after = conjugate_marginal_rate(curve, reduced_x_after, y_int)

    p_low_reconstructed, p_high_reconstructed = reconstruct_bounds(curve)
    native_endpoint_mean = d_up(
        curve.alpha_native,
        quote_out.native_rate_before,
        quote_out.native_rate_after,
    )
    if curve.side == "buy":
        displayed_endpoint_mean = d_up(
            curve.alpha_displayed,
            quote_out.displayed_price_before,
            quote_out.displayed_price_after,
        )
    else:
        displayed_endpoint_mean = d_down(
            curve.alpha_displayed,
            quote_out.displayed_price_before,
            quote_out.displayed_price_after,
        )

    x_int = x_of_y(curve, decimal(0), y_int)
    full_domain_mean = d_up(curve.alpha_native, curve.p_high, curve.p_low)
    intercept_ratio = y_int / x_int
    combined_cost, split_cost = split_path_cost(
        curve,
        y,
        y_int,
        amount_out * decimal("0.37"),
        amount_out * decimal("0.63"),
    )

    _assert_close("native holder before", direct_native_before, quote_out.native_rate_before)
    _assert_close("native holder after", direct_native_after, quote_out.native_rate_after)
    _assert_close("displayed holder before", direct_displayed_before, compiled_displayed_before)
    _assert_close("displayed holder after", direct_displayed_after, compiled_displayed_after)
    _assert_close("integrated x before", integral_x_before, reduced_x_before)
    _assert_close("integrated x after", integral_x_after, reduced_x_after)
    _assert_close("inverse y before", inverse_y_before, y)
    _assert_close("inverse y after", inverse_y_after, quote_out.y_after)
    _assert_close("conjugate marginal before", conjugate_rate_before, quote_out.native_rate_before)
    _assert_close("conjugate marginal after", conjugate_rate_after, quote_out.native_rate_after)
    _assert_close("exact input/output amount", quote_in.amount_out, quote_out.amount_out)
    _assert_close("native endpoint mean", native_endpoint_mean, quote_out.native_effective_rate)
    _assert_close("displayed endpoint mean", displayed_endpoint_mean, quote_out.displayed_effective_price)
    _assert_close("low reconstruction", p_low_reconstructed, curve.p_low)
    _assert_close("high reconstruction", p_high_reconstructed, curve.p_high)
    _assert_close("intercept ratio", intercept_ratio, full_domain_mean)
    _assert_close("split path", combined_cost, split_cost)

    interior_document: dict[str, Any] | None
    if curve.is_flat:
        interior_document = None
    else:
        recovered_y_int = recover_y_int(curve, y, quote_out.native_rate_before)
        _assert_close("interior yInt recovery", recovered_y_int, y_int)
        interior_document = {
            "marginal_native_rate": _real(quote_out.native_rate_before),
            "recovered_y_int": _real(recovered_y_int),
        }

    return {
        "id": scenario.identifier,
        "coverage": list(scenario.coverage),
        "displayed_policy": {
            "side": scenario.side,
            "start_price_quote_per_base": _real(start_price),
            "end_price_quote_per_base": _real(end_price),
            "maker_alpha": _real(alpha),
        },
        "compiled_native_curve": _compiled_document(curve),
        "state": {
            "y_int": _real(y_int),
            "y_before": _real(y),
            "progress_before": _real(progress_before),
            "progress_after": _real(progress_after),
        },
        "schedule_cross_checks": {
            "native_holder_before": _real(direct_native_before),
            "native_holder_after": _real(direct_native_after),
            "displayed_holder_before": _real(direct_displayed_before),
            "displayed_holder_after": _real(direct_displayed_after),
        },
        "coordinate_cross_checks": {
            "x_reduced_before": _real(reduced_x_before),
            "x_integral_before": _real(integral_x_before),
            "x_reduced_after": _real(reduced_x_after),
            "x_integral_after": _real(integral_x_after),
            "inverse_y_before": _real(inverse_y_before),
            "inverse_y_after": _real(inverse_y_after),
            "conjugate_rate_before": _real(conjugate_rate_before),
            "conjugate_rate_after": _real(conjugate_rate_after),
            "x_int": _real(x_int),
        },
        "exact_output": _quote_document(quote_out),
        "exact_input_round_trip": _quote_document(quote_in),
        "effective_price_cross_checks": {
            "native_secant": _real(quote_out.native_effective_rate),
            "native_d_up": _real(native_endpoint_mean),
            "displayed_from_native": _real(quote_out.displayed_effective_price),
            "displayed_endpoint_mean": _real(displayed_endpoint_mean),
            "full_domain_y_int_over_x_int": _real(intercept_ratio),
            "full_domain_d_up": _real(full_domain_mean),
        },
        "boundary_reconstruction": {
            "p_low": _real(p_low_reconstructed),
            "p_high": _real(p_high_reconstructed),
        },
        "interior_initializer": interior_document,
        "path_consistency": {
            "combined_cost": _real(combined_cost),
            "split_cost": _real(split_cost),
        },
        "convex_cost_check": {
            "marginal_cost_before": _real(decimal(1) / quote_out.native_rate_before),
            "marginal_cost_after": _real(decimal(1) / quote_out.native_rate_after),
            "nondecreasing": decimal(1) / quote_out.native_rate_after
            >= decimal(1) / quote_out.native_rate_before,
        },
        "normalized_wad_rounding": {
            "exact_output_required_input": _interval(quote_out.amount_in, "ceiling"),
            "exact_output_delivered_output": _interval(quote_out.amount_out, "floor"),
            "exact_output_y_after": _interval(quote_out.y_after, "floor"),
            "exact_input_requested_input": _interval(quote_in.amount_in, "exact-request"),
            "exact_input_delivered_output": _interval(quote_in.amount_out, "floor"),
            "native_rate_before": _interval(quote_out.native_rate_before),
            "native_rate_after": _interval(quote_out.native_rate_after),
            "native_effective_rate": _interval(quote_out.native_effective_rate),
            "displayed_effective_price": _interval(quote_out.displayed_effective_price),
        },
    }


def _build_recycling_vectors() -> list[dict[str, Any]]:
    cases = (
        {
            "id": "nonempty-buy-side-homothetic-scale",
            "credited_from": "sell-execution",
            "curve": compile_curve("buy", decimal("220"), decimal("80"), decimal("2")),
            "y": decimal("400"),
            "y_int": decimal("1000"),
            "received": decimal("125"),
        },
        {
            "id": "empty-sell-side-rearm",
            "credited_from": "buy-execution",
            "curve": compile_curve("sell", decimal("100"), decimal("240"), decimal("2")),
            "y": decimal("0"),
            "y_int": decimal("50"),
            "received": decimal("8"),
        },
        {
            "id": "nonempty-flat-sell-scale",
            "credited_from": "buy-execution",
            "curve": compile_curve("sell", decimal("125"), decimal("125"), decimal("99")),
            "y": decimal("12"),
            "y_int": decimal("24"),
            "received": decimal("3"),
        },
    )
    documents: list[dict[str, Any]] = []
    for case in cases:
        curve: NativeCurve = case["curve"]
        y = case["y"]
        y_int = case["y_int"]
        received = case["received"]
        result = recycle_inventory(y, y_int, received)
        document: dict[str, Any] = {
            "id": case["id"],
            "credited_from": case["credited_from"],
            "curve": _compiled_document(curve),
            "before": {"y": _real(y), "y_int": _real(y_int)},
            "received": _real(received),
            "result": {
                "mode": result.mode,
                "y_after": _real(result.y_after),
                "y_int_after": _real(result.y_int_after),
                "scale": None if result.scale is None else _real(result.scale),
            },
            "normalized_wad_rounding": {
                "received": _interval(received, "floor"),
                "y_after": _interval(result.y_after, "floor"),
                "y_int_after": _interval(result.y_int_after, "floor"),
            },
        }
        if result.mode == "scale":
            rate_before = native_marginal_rate(curve, y, y_int)
            rate_after = native_marginal_rate(curve, result.y_after, result.y_int_after)
            x_before = x_of_y(curve, y, y_int)
            x_after = x_of_y(curve, result.y_after, result.y_int_after)
            expected_scaled_x = x_before * result.scale
            _assert_close("recycling marginal preservation", rate_before, rate_after)
            _assert_close("recycling coordinate scaling", x_after, expected_scaled_x)
            document["invariants"] = {
                "native_rate_before": _real(rate_before),
                "native_rate_after": _real(rate_after),
                "x_before": _real(x_before),
                "x_after": _real(x_after),
                "expected_scaled_x": _real(expected_scaled_x),
            }
        else:
            rate_after = native_marginal_rate(curve, result.y_after, result.y_int_after)
            _assert_close("rearm starts at PHigh", rate_after, curve.p_high)
            document["invariants"] = {
                "native_rate_after": _real(rate_after),
                "expected_start_rate": _real(curve.p_high),
                "progress_after": "0",
            }
        documents.append(document)
    return documents


def build_reference_document() -> dict[str, Any]:
    """Build all valid equation and transition vectors."""

    return {
        "schema": "liquid-ob-high-precision-reference-v1",
        "source": "docs/MATH_SPEC.md",
        "generator": "tools.reference.generate_vectors",
        "independence": (
            "stdlib Decimal only; no Solidity artifacts or TypeScript SDK imports"
        ),
        "numeric_contract": {
            "decimal_precision": DECIMAL_PRECISION,
            "serialized_decimal_places": SERIALIZED_DECIMAL_PLACES,
            "wad": str(int(WAD)),
            "rounding_interval": (
                "floor and ceiling are adjacent normalized WAD integers "
                "enclosing the ideal real value"
            ),
            "required_input_rounding": "ceiling",
            "delivered_output_rounding": "floor",
        },
        "equation_coverage": {
            "holder_displayed_schedule": "every curve vector",
            "buy_sell_native_compilation_and_reciprocity": "every curve vector",
            "parametric_integral_bonding_curve": (
                "coordinate_cross_checks in every curve vector"
            ),
            "beta_native_equals_alpha_native_minus_one": (
                "compiled_native_curve in every vector"
            ),
            "dual_endpoint_effective_means": "effective_price_cross_checks in every vector",
            "reduced_mu_kappa_encoding_and_boundary_reconstruction": (
                "every curve vector"
            ),
            "native_marginal_and_coordinate_functions": "every curve vector",
            "analytical_inverse_coordinate": (
                "coordinate_cross_checks and exact_input_round_trip"
            ),
            "conjugate_beta_marginal_schedule": (
                "coordinate_cross_checks in every curve vector"
            ),
            "exact_input_and_exact_output_maps": "every curve vector",
            "generalized_interior_y_int_recovery": (
                "every non-flat curve vector"
            ),
            "flat_order_extension": ["flat-buy-full", "flat-sell-partial"],
            "homothetic_recycling_and_empty_rearm": "recycling_vectors",
            "split_versus_combined_path_consistency": (
                "path_consistency in every curve vector"
            ),
            "convex_exact_output_cost": "convex_cost_check in every curve vector",
        },
        "curve_vectors": [build_curve_vector(scenario) for scenario in SCENARIOS],
        "recycling_vectors": _build_recycling_vectors(),
    }


def build_invalid_document() -> dict[str, Any]:
    """Build machine-readable invalid-domain cases exercised by unit tests."""

    cases = [
        (
            "invalid-side",
            "compile_curve",
            {"side": "hold", "start_price": "2", "end_price": "1", "alpha": "0"},
            "INVALID_SIDE",
        ),
        (
            "nonpositive-start-rate",
            "compile_curve",
            {"side": "buy", "start_price": "0", "end_price": "1", "alpha": "0"},
            "NONPOSITIVE_RATE",
        ),
        (
            "wrong-buy-order",
            "compile_curve",
            {"side": "buy", "start_price": "100", "end_price": "200", "alpha": "0"},
            "WRONG_ENDPOINT_ORDER",
        ),
        (
            "wrong-sell-order",
            "compile_curve",
            {"side": "sell", "start_price": "200", "end_price": "100", "alpha": "0"},
            "WRONG_ENDPOINT_ORDER",
        ),
        (
            "progress-above-one",
            "holder_price",
            {
                "start_price": "200",
                "end_price": "100",
                "alpha": "0",
                "progress": "1.000000000000000001",
            },
            "PROGRESS_OUT_OF_RANGE",
        ),
        (
            "negative-live-reserve",
            "native_marginal_rate",
            {"curve": "buy-alpha-zero", "y": "-1", "y_int": "100"},
            "STATE_OUT_OF_RANGE",
        ),
        (
            "reserve-above-scale",
            "x_of_y",
            {"curve": "buy-alpha-zero", "y": "101", "y_int": "100"},
            "STATE_OUT_OF_RANGE",
        ),
        (
            "zero-runtime-scale",
            "x_of_y",
            {"curve": "buy-alpha-zero", "y": "0", "y_int": "0"},
            "NONPOSITIVE_SCALE",
        ),
        (
            "inverse-beyond-capacity",
            "y_of_x",
            {"curve": "buy-alpha-zero", "x": "1000000", "y_int": "100"},
            "X_OUT_OF_RANGE",
        ),
        (
            "zero-exact-output",
            "quote_exact_output",
            {"curve": "buy-alpha-zero", "y": "100", "y_int": "100", "amount_out": "0"},
            "ZERO_AMOUNT",
        ),
        (
            "output-exceeds-reserve",
            "quote_exact_output",
            {"curve": "buy-alpha-zero", "y": "100", "y_int": "100", "amount_out": "101"},
            "INSUFFICIENT_RESERVE",
        ),
        (
            "zero-exact-input",
            "quote_exact_input",
            {"curve": "buy-alpha-zero", "y": "100", "y_int": "100", "amount_in": "0"},
            "ZERO_AMOUNT",
        ),
        (
            "input-exceeds-capacity",
            "quote_exact_input",
            {
                "curve": "buy-alpha-zero",
                "y": "100",
                "y_int": "100",
                "amount_in": "1000000",
            },
            "INPUT_EXCEEDS_CAPACITY",
        ),
        (
            "interior-at-low-boundary",
            "recover_y_int",
            {"curve": "buy-alpha-zero", "y": "50", "marginal_native_rate": "100"},
            "MARGINAL_RATE_OUT_OF_RANGE",
        ),
        (
            "zero-recycled-inventory",
            "recycle_inventory",
            {"y": "10", "y_int": "20", "received": "0"},
            "ZERO_RECEIVED",
        ),
        (
            "negative-unsigned-wire-value",
            "encode_unsigned_wad",
            {"value": "-0.000000000000000001", "rounding": "floor"},
            "NEGATIVE_UNSIGNED_WAD",
        ),
        (
            "invalid-wire-rounding-mode",
            "encode_unsigned_wad",
            {"value": "1", "rounding": "nearest"},
            "INVALID_ROUNDING_MODE",
        ),
        (
            "unsigned-wire-overflow",
            "encode_unsigned_wad",
            {"value": "340282366920938463464", "rounding": "ceiling"},
            "UNSIGNED_WAD_OVERFLOW",
        ),
        (
            "signed-alpha-wire-overflow",
            "encode_signed_wad",
            {"value": "170141183460469231732", "rounding": "ceiling"},
            "SIGNED_WAD_OVERFLOW",
        ),
    ]
    return {
        "schema": "liquid-ob-invalid-domain-reference-v1",
        "source": "docs/MATH_SPEC.md and docs/WIRE_FORMAT.md",
        "cases": [
            {
                "id": identifier,
                "operation": operation,
                "arguments": arguments,
                "expected_error": expected_error,
            }
            for identifier, operation, arguments, expected_error in cases
        ],
    }
