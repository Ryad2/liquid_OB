"""Tests for the independent high-precision mathematical oracle."""

from __future__ import annotations

import json
import unittest
from decimal import Decimal
from pathlib import Path
from typing import Any

from .generate_vectors import OUTPUTS
from .reference_math import (
    ReferenceDomainError,
    compile_curve,
    conjugate_marginal_rate,
    d_down,
    d_up,
    decimal,
    encode_signed_wad,
    encode_unsigned_wad,
    holder_price,
    native_marginal_rate,
    quote_exact_input,
    quote_exact_output,
    recover_y_int,
    recycle_inventory,
    x_of_y,
    y_of_x,
)
from .vector_cases import SCENARIOS, build_invalid_document, build_reference_document


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


class ReferenceMathTest(unittest.TestCase):
    def assertDecimalClose(
        self,
        left: Decimal,
        right: Decimal,
        relative_tolerance: Decimal = Decimal("1e-65"),
    ) -> None:
        scale = max(Decimal(1), abs(left), abs(right))
        self.assertLessEqual(abs(left - right), relative_tolerance * scale)

    def test_committed_documents_match_deterministic_builders(self) -> None:
        for path, builder in OUTPUTS.items():
            self.assertTrue(path.exists(), path)
            committed = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(committed, builder())

    def test_scenario_matrix_covers_required_branches_and_boundaries(self) -> None:
        tags = {tag for scenario in SCENARIOS for tag in scenario.coverage}
        required = {
            "maker-alpha-positive",
            "maker-alpha-negative",
            "maker-alpha-zero",
            "native-alpha-zero",
            "native-alpha-one",
            "native-alpha-greater-than-one",
            "native-alpha-between-zero-and-one",
            "native-alpha-negative",
            "flat-order",
            "buy-orientation",
            "sell-orientation",
            "partial-fill",
            "full-fill",
            "near-full-fill",
            "near-empty-state",
            "large-positive-alpha",
            "large-negative-alpha",
            "near-native-alpha-zero",
            "near-native-alpha-one",
        }
        self.assertEqual(set(), required - tags)

    def test_known_full_range_alpha_zero_effective_prices(self) -> None:
        buy = compile_curve("buy", decimal("200"), decimal("100"), decimal("0"))
        buy_quote = quote_exact_output(buy, decimal("1000"), decimal("1000"), decimal("1000"))
        expected_buy = decimal("200") * decimal("100") * decimal("2").ln() / decimal("100")
        self.assertDecimalClose(buy_quote.displayed_effective_price, expected_buy)

        sell = compile_curve("sell", decimal("100"), decimal("200"), decimal("0"))
        sell_quote = quote_exact_output(sell, decimal("10"), decimal("10"), decimal("10"))
        expected_sell = (decimal("100") - decimal("200")) / (
            decimal("100").ln() - decimal("200").ln()
        )
        self.assertDecimalClose(sell_quote.displayed_effective_price, expected_sell)

    def test_effective_mean_checkpoint_values(self) -> None:
        high = decimal("200")
        low = decimal("100")
        self.assertDecimalClose(d_up(decimal("2"), high, low), decimal("150"))
        self.assertDecimalClose(d_up(decimal("0.5"), high, low), (high * low).sqrt())
        self.assertDecimalClose(d_up(decimal("-1"), high, low), decimal("400") / decimal("3"))
        self.assertDecimalClose(d_down(decimal("1"), low, high), decimal("150"))
        self.assertDecimalClose(d_down(decimal("-0.5"), low, high), (high * low).sqrt())
        self.assertDecimalClose(d_down(decimal("-2"), low, high), decimal("400") / decimal("3"))

    def test_conjugate_beta_schedule_matches_reserve_oriented_slope(self) -> None:
        for scenario in SCENARIOS:
            curve = compile_curve(
                scenario.side,
                decimal(scenario.start_price),
                decimal(scenario.end_price),
                decimal(scenario.alpha),
            )
            y = decimal(scenario.y)
            y_int = decimal(scenario.y_int)
            x = x_of_y(curve, y, y_int)
            self.assertDecimalClose(
                conjugate_marginal_rate(curve, x, y_int),
                native_marginal_rate(curve, y, y_int),
            )

    def test_flat_orders_ignore_alpha_and_preserve_orientation(self) -> None:
        buy = compile_curve("buy", decimal("150"), decimal("150"), decimal("999"))
        sell = compile_curve("sell", decimal("150"), decimal("150"), decimal("-999"))
        self.assertEqual(buy.alpha_native, decimal("0"))
        self.assertEqual(sell.alpha_native, decimal("0"))
        self.assertEqual(buy.kappa, decimal("150"))
        self.assertEqual(sell.kappa, decimal("1") / decimal("150"))
        self.assertEqual(
            quote_exact_output(buy, decimal("300"), decimal("300"), decimal("75")).amount_in,
            decimal("0.5"),
        )
        self.assertEqual(
            quote_exact_output(sell, decimal("2"), decimal("2"), decimal("0.5")).amount_in,
            decimal("75"),
        )

    def test_singular_neighbors_are_continuous(self) -> None:
        epsilon = decimal("0.000000000000000001")
        for singular in (decimal("0"), decimal("1")):
            exact = compile_curve("buy", decimal("175"), decimal("95"), singular)
            neighbor = compile_curve("buy", decimal("175"), decimal("95"), singular + epsilon)
            for y in (decimal("640"), decimal("512"), decimal("64")):
                exact_rate = native_marginal_rate(exact, y, decimal("640"))
                neighbor_rate = native_marginal_rate(neighbor, y, decimal("640"))
                exact_x = x_of_y(exact, y, decimal("640"))
                neighbor_x = x_of_y(neighbor, y, decimal("640"))
                self.assertDecimalClose(exact_rate, neighbor_rate, decimal("1e-17"))
                self.assertDecimalClose(exact_x, neighbor_x, decimal("1e-17"))

    def test_homothetic_scaling_and_empty_rearm(self) -> None:
        curve = compile_curve("buy", decimal("220"), decimal("80"), decimal("2"))
        scaled = recycle_inventory(decimal("400"), decimal("1000"), decimal("125"))
        self.assertEqual(scaled.mode, "scale")
        self.assertDecimalClose(
            native_marginal_rate(curve, decimal("400"), decimal("1000")),
            native_marginal_rate(curve, scaled.y_after, scaled.y_int_after),
        )
        self.assertDecimalClose(
            x_of_y(curve, scaled.y_after, scaled.y_int_after),
            x_of_y(curve, decimal("400"), decimal("1000")) * scaled.scale,
        )

        rearmed = recycle_inventory(decimal("0"), decimal("1000"), decimal("125"))
        self.assertEqual(rearmed.mode, "rearm")
        self.assertEqual(rearmed.y_after, decimal("125"))
        self.assertEqual(rearmed.y_int_after, decimal("125"))
        self.assertDecimalClose(
            native_marginal_rate(curve, rearmed.y_after, rearmed.y_int_after),
            curve.p_high,
        )

    def test_rounding_intervals_enclose_values_by_at_most_one_wad_unit(self) -> None:
        document = build_reference_document()
        for vector in document["curve_vectors"]:
            amount_in = decimal(vector["exact_output"]["amount_in"])
            interval = vector["normalized_wad_rounding"]["exact_output_required_input"]
            scaled = amount_in * decimal("1000000000000000000")
            floor = decimal(interval["floor"])
            ceiling = decimal(interval["ceiling"])
            self.assertLessEqual(floor, scaled)
            self.assertLessEqual(scaled, ceiling)
            self.assertIn(ceiling - floor, (decimal("0"), decimal("1")))
            self.assertEqual(interval["direction"], "ceiling")

    def test_invalid_domain_vectors_raise_the_declared_error(self) -> None:
        curve = compile_curve("buy", decimal("200"), decimal("100"), decimal("0"))

        def execute(operation: str, arguments: dict[str, str]) -> Any:
            if operation == "compile_curve":
                return compile_curve(
                    arguments["side"],
                    decimal(arguments["start_price"]),
                    decimal(arguments["end_price"]),
                    decimal(arguments["alpha"]),
                )
            if operation == "holder_price":
                return holder_price(
                    decimal(arguments["start_price"]),
                    decimal(arguments["end_price"]),
                    decimal(arguments["alpha"]),
                    decimal(arguments["progress"]),
                )
            if operation == "native_marginal_rate":
                return native_marginal_rate(curve, decimal(arguments["y"]), decimal(arguments["y_int"]))
            if operation == "x_of_y":
                return x_of_y(curve, decimal(arguments["y"]), decimal(arguments["y_int"]))
            if operation == "y_of_x":
                return y_of_x(curve, decimal(arguments["x"]), decimal(arguments["y_int"]))
            if operation == "quote_exact_output":
                return quote_exact_output(
                    curve,
                    decimal(arguments["y"]),
                    decimal(arguments["y_int"]),
                    decimal(arguments["amount_out"]),
                )
            if operation == "quote_exact_input":
                return quote_exact_input(
                    curve,
                    decimal(arguments["y"]),
                    decimal(arguments["y_int"]),
                    decimal(arguments["amount_in"]),
                )
            if operation == "recover_y_int":
                return recover_y_int(
                    curve,
                    decimal(arguments["y"]),
                    decimal(arguments["marginal_native_rate"]),
                )
            if operation == "recycle_inventory":
                return recycle_inventory(
                    decimal(arguments["y"]),
                    decimal(arguments["y_int"]),
                    decimal(arguments["received"]),
                )
            if operation == "encode_unsigned_wad":
                return encode_unsigned_wad(decimal(arguments["value"]), arguments["rounding"])
            if operation == "encode_signed_wad":
                return encode_signed_wad(decimal(arguments["value"]), arguments["rounding"])
            self.fail(f"unhandled operation: {operation}")

        for case in build_invalid_document()["cases"]:
            with self.subTest(case=case["id"]):
                with self.assertRaises(ReferenceDomainError) as caught:
                    execute(case["operation"], case["arguments"])
                self.assertEqual(caught.exception.code, case["expected_error"])


if __name__ == "__main__":
    unittest.main()
