"""Independent real-number oracle for the Liquid OB mathematical kernel.

This module intentionally imports neither Solidity artifacts nor TypeScript
packages. It evaluates the normative equations in ``docs/MATH_SPEC.md`` with
Python's arbitrary-precision ``Decimal`` implementation and is used only to
produce and verify development-time test vectors.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import (
    Decimal,
    ROUND_CEILING,
    ROUND_FLOOR,
    ROUND_HALF_EVEN,
    getcontext,
    localcontext,
)
from typing import Final, Literal


DECIMAL_PRECISION: Final = 120
SERIALIZED_DECIMAL_PLACES: Final = 72
WAD: Final = Decimal(10) ** 18
UINT128_MAX: Final = (1 << 128) - 1
INT128_MAX: Final = (1 << 127) - 1
INT128_MIN: Final = -(1 << 127)

getcontext().prec = DECIMAL_PRECISION

ZERO: Final = Decimal(0)
ONE: Final = Decimal(1)
SIDE_BUY: Final = "buy"
SIDE_SELL: Final = "sell"

Side = Literal["buy", "sell"]


class ReferenceDomainError(ValueError):
    """A deterministic mathematical-domain failure used by invalid vectors."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


@dataclass(frozen=True)
class NativeCurve:
    """One displayed side compiled into native output-per-input coordinates."""

    side: Side
    start_price: Decimal
    end_price: Decimal
    alpha_displayed: Decimal
    alpha_native: Decimal
    p_high: Decimal
    p_low: Decimal
    mu: Decimal
    kappa: Decimal
    branch: str

    @property
    def beta_native(self) -> Decimal:
        return self.alpha_native - ONE

    @property
    def is_flat(self) -> bool:
        return self.branch == "flat"

    @property
    def gamma(self) -> Decimal:
        if self.is_flat or self.alpha_native in (ZERO, ONE):
            raise ReferenceDomainError(
                "GAMMA_UNDEFINED",
                "gamma is not used by flat, native-alpha-zero, or native-alpha-one branches",
            )
        return abs((self.alpha_native - ONE) / self.alpha_native)


@dataclass(frozen=True)
class Quote:
    """An exact curve-only quote in native incoming/outgoing token units."""

    amount_in: Decimal
    amount_out: Decimal
    y_before: Decimal
    y_after: Decimal
    x_before: Decimal
    x_after: Decimal
    native_rate_before: Decimal
    native_rate_after: Decimal
    native_effective_rate: Decimal
    displayed_price_before: Decimal
    displayed_price_after: Decimal
    displayed_effective_price: Decimal


@dataclass(frozen=True)
class RecyclingResult:
    """Result of crediting received inventory to the opposite curve side."""

    mode: Literal["scale", "rearm"]
    y_after: Decimal
    y_int_after: Decimal
    scale: Decimal | None


def decimal(value: Decimal | int | str) -> Decimal:
    """Convert exact textual input to ``Decimal`` without a float round trip."""

    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _require(condition: bool, code: str, message: str) -> None:
    if not condition:
        raise ReferenceDomainError(code, message)


def _pow_positive(base: Decimal, exponent: Decimal) -> Decimal:
    _require(base > ZERO, "NONPOSITIVE_POWER_BASE", "real powers require a positive base")
    if exponent == ZERO:
        return ONE
    return (exponent * base.ln()).exp()


def _approximately_equal(
    left: Decimal,
    right: Decimal,
    relative_tolerance: Decimal = Decimal("1e-100"),
) -> bool:
    scale = max(ONE, abs(left), abs(right))
    return abs(left - right) <= relative_tolerance * scale


def _clamp_to_interval(
    value: Decimal,
    low: Decimal,
    high: Decimal,
    code: str,
) -> Decimal:
    if value < low:
        if _approximately_equal(value, low):
            return low
        raise ReferenceDomainError(code, f"value {value} is below {low}")
    if value > high:
        if _approximately_equal(value, high):
            return high
        raise ReferenceDomainError(code, f"value {value} is above {high}")
    return value


def holder_price(
    start_price: Decimal,
    end_price: Decimal,
    alpha: Decimal,
    progress: Decimal,
) -> Decimal:
    """Evaluate the maker-facing Holder marginal-price schedule."""

    start_price = decimal(start_price)
    end_price = decimal(end_price)
    alpha = decimal(alpha)
    progress = decimal(progress)
    _require(start_price > ZERO and end_price > ZERO, "NONPOSITIVE_RATE", "prices must be positive")
    _require(ZERO <= progress <= ONE, "PROGRESS_OUT_OF_RANGE", "progress must be in [0, 1]")
    if start_price == end_price:
        return start_price
    if alpha == ZERO:
        return ((ONE - progress) * start_price.ln() + progress * end_price.ln()).exp()
    weighted_power = (
        (ONE - progress) * _pow_positive(start_price, alpha)
        + progress * _pow_positive(end_price, alpha)
    )
    return _pow_positive(weighted_power, ONE / alpha)


def compile_curve(
    side: Side,
    start_price: Decimal,
    end_price: Decimal,
    alpha_displayed: Decimal,
) -> NativeCurve:
    """Compile displayed quote-per-base policy into native curve constants."""

    start_price = decimal(start_price)
    end_price = decimal(end_price)
    alpha_displayed = decimal(alpha_displayed)
    _require(side in (SIDE_BUY, SIDE_SELL), "INVALID_SIDE", "side must be buy or sell")
    _require(start_price > ZERO and end_price > ZERO, "NONPOSITIVE_RATE", "prices must be positive")
    if side == SIDE_BUY:
        _require(start_price >= end_price, "WRONG_ENDPOINT_ORDER", "buy start price must be >= end price")
        p_high = start_price
        p_low = end_price
        alpha_native = alpha_displayed
    else:
        _require(start_price <= end_price, "WRONG_ENDPOINT_ORDER", "sell start price must be <= end price")
        p_high = ONE / start_price
        p_low = ONE / end_price
        alpha_native = -alpha_displayed

    if p_high == p_low:
        return NativeCurve(
            side=side,
            start_price=start_price,
            end_price=end_price,
            alpha_displayed=ZERO,
            alpha_native=ZERO,
            p_high=p_high,
            p_low=p_low,
            mu=ZERO,
            kappa=p_high,
            branch="flat",
        )

    _require(p_high > p_low > ZERO, "INVALID_NATIVE_BOUNDS", "native bounds must satisfy 0 < low < high")

    if alpha_native > ZERO:
        mu = ONE - _pow_positive(p_low / p_high, alpha_native)
    elif alpha_native == ZERO:
        mu = (p_high / p_low).ln()
    else:
        mu = ONE - _pow_positive(p_high / p_low, alpha_native)

    if alpha_native > ONE:
        branch = "greater_than_one"
        gamma = abs((alpha_native - ONE) / alpha_native)
        kappa = mu * gamma * p_high
    elif alpha_native == ONE:
        branch = "one"
        kappa = mu * p_high
    elif alpha_native > ZERO:
        branch = "between_zero_and_one"
        gamma = abs((alpha_native - ONE) / alpha_native)
        kappa = mu * gamma * p_high
    elif alpha_native == ZERO:
        branch = "zero"
        kappa = mu * p_low
    else:
        branch = "negative"
        gamma = abs((alpha_native - ONE) / alpha_native)
        kappa = mu * gamma * p_low

    _require(mu > ZERO and kappa > ZERO, "INVALID_REDUCED_ENCODING", "mu and kappa must be positive")
    return NativeCurve(
        side=side,
        start_price=start_price,
        end_price=end_price,
        alpha_displayed=alpha_displayed,
        alpha_native=alpha_native,
        p_high=p_high,
        p_low=p_low,
        mu=mu,
        kappa=kappa,
        branch=branch,
    )


def reconstruct_bounds(curve: NativeCurve) -> tuple[Decimal, Decimal]:
    """Recover ``(PLow, PHigh)`` from the reduced native encoding."""

    if curve.is_flat:
        return curve.kappa, curve.kappa
    alpha = curve.alpha_native
    if alpha > ZERO:
        if alpha == ONE:
            p_high = curve.kappa / curve.mu
            p_low = p_high * (ONE - curve.mu)
        else:
            p_high = curve.kappa / (curve.mu * curve.gamma)
            p_low = p_high * _pow_positive(ONE - curve.mu, ONE / alpha)
    elif alpha == ZERO:
        p_low = curve.kappa / curve.mu
        p_high = p_low * curve.mu.exp()
    else:
        p_low = curve.kappa / (curve.mu * curve.gamma)
        p_high = p_low * _pow_positive(ONE - curve.mu, ONE / alpha)
    return p_low, p_high


def _validate_state(y: Decimal, y_int: Decimal) -> tuple[Decimal, Decimal]:
    y = decimal(y)
    y_int = decimal(y_int)
    _require(y_int > ZERO, "NONPOSITIVE_SCALE", "yInt must be positive for curve evaluation")
    _require(ZERO <= y <= y_int, "STATE_OUT_OF_RANGE", "state must satisfy 0 <= y <= yInt")
    return y, y_int


def native_marginal_rate(curve: NativeCurve, y: Decimal, y_int: Decimal) -> Decimal:
    """Evaluate ``P_E(y)`` in native outgoing-per-incoming units."""

    y, y_int = _validate_state(y, y_int)
    if curve.is_flat:
        return curve.kappa
    ratio = y / y_int
    alpha = curve.alpha_native
    if alpha > ONE:
        z = ONE - curve.mu * (ONE - ratio)
        return curve.kappa / (curve.mu * curve.gamma) * _pow_positive(z, ONE - curve.gamma)
    if alpha == ONE:
        z = ONE - curve.mu * (ONE - ratio)
        return curve.kappa / curve.mu * z
    if alpha > ZERO:
        z = ONE - curve.mu * (ONE - ratio)
        return curve.kappa / (curve.mu * curve.gamma) * _pow_positive(z, ONE + curve.gamma)
    if alpha == ZERO:
        return curve.kappa / curve.mu * (curve.mu * ratio).exp()
    return (
        curve.kappa
        / (curve.mu * curve.gamma)
        * _pow_positive(ONE - curve.mu * ratio, ONE - curve.gamma)
    )


def x_of_y(curve: NativeCurve, y: Decimal, y_int: Decimal) -> Decimal:
    """Evaluate the integrated incoming-token coordinate ``x_E(y)``."""

    y, y_int = _validate_state(y, y_int)
    if curve.is_flat:
        return (y_int - y) / curve.kappa
    ratio = y / y_int
    alpha = curve.alpha_native
    if alpha > ONE:
        z = ONE - curve.mu * (ONE - ratio)
        return y_int / curve.kappa * (ONE - _pow_positive(z, curve.gamma))
    if alpha == ONE:
        z = ONE - curve.mu * (ONE - ratio)
        return -y_int / curve.kappa * z.ln()
    if alpha > ZERO:
        z = ONE - curve.mu * (ONE - ratio)
        return y_int / curve.kappa * (_pow_positive(z, -curve.gamma) - ONE)
    if alpha == ZERO:
        return y_int / curve.kappa * ((-curve.mu * ratio).exp() - (-curve.mu).exp())
    return y_int / curve.kappa * (
        _pow_positive(ONE - curve.mu * ratio, curve.gamma)
        - _pow_positive(ONE - curve.mu, curve.gamma)
    )


def y_of_x(curve: NativeCurve, x: Decimal, y_int: Decimal) -> Decimal:
    """Evaluate the exact inverse coordinate ``y_E(x)``."""

    x = decimal(x)
    y_int = decimal(y_int)
    _require(y_int > ZERO, "NONPOSITIVE_SCALE", "yInt must be positive for curve evaluation")
    capacity = x_of_y(curve, ZERO, y_int)
    x = _clamp_to_interval(x, ZERO, capacity, "X_OUT_OF_RANGE")
    if curve.is_flat:
        result = y_int - x * curve.kappa
    else:
        alpha = curve.alpha_native
        scaled_x = curve.kappa * x / y_int
        if alpha > ONE:
            result = y_int / curve.mu * (
                _pow_positive(ONE - scaled_x, ONE / curve.gamma) + curve.mu - ONE
            )
        elif alpha == ONE:
            result = y_int / curve.mu * ((-scaled_x).exp() + curve.mu - ONE)
        elif alpha > ZERO:
            result = y_int / curve.mu * (
                _pow_positive(ONE + scaled_x, -ONE / curve.gamma) + curve.mu - ONE
            )
        elif alpha == ZERO:
            result = -y_int / curve.mu * (
                (-curve.mu).exp() + scaled_x
            ).ln()
        else:
            result = y_int / curve.mu * (
                ONE
                - _pow_positive(
                    _pow_positive(ONE - curve.mu, curve.gamma) + scaled_x,
                    ONE / curve.gamma,
                )
            )
    return _clamp_to_interval(result, ZERO, y_int, "INVERSE_STATE_OUT_OF_RANGE")


def conjugate_marginal_rate(curve: NativeCurve, x: Decimal, y_int: Decimal) -> Decimal:
    """Evaluate the beta-oriented Holder schedule at incoming coordinate ``x``."""

    x = decimal(x)
    y_int = decimal(y_int)
    _require(y_int > ZERO, "NONPOSITIVE_SCALE", "yInt must be positive for curve evaluation")
    x_int = x_of_y(curve, ZERO, y_int)
    x = _clamp_to_interval(x, ZERO, x_int, "X_OUT_OF_RANGE")
    if curve.is_flat:
        return curve.kappa
    return holder_price(curve.p_high, curve.p_low, curve.beta_native, x / x_int)


def native_holder_rate(curve: NativeCurve, progress: Decimal) -> Decimal:
    """Evaluate the native marginal schedule directly from ``H``, ``L``, and ``a``."""

    return holder_price(curve.p_high, curve.p_low, curve.alpha_native, progress)


def direct_integrated_x(
    curve: NativeCurve,
    y_int: Decimal,
    progress: Decimal,
) -> Decimal:
    """Integrate ``1/P(t)`` using the closed forms in MATH_SPEC section 4."""

    y_int = decimal(y_int)
    progress = decimal(progress)
    _require(y_int > ZERO, "NONPOSITIVE_SCALE", "yInt must be positive")
    _require(ZERO <= progress <= ONE, "PROGRESS_OUT_OF_RANGE", "progress must be in [0, 1]")
    if curve.is_flat:
        return y_int * progress / curve.kappa
    alpha = curve.alpha_native
    high = curve.p_high
    low = curve.p_low
    if alpha == ONE:
        marginal = native_holder_rate(curve, progress)
        return y_int / (high - low) * (high / marginal).ln()
    if alpha == ZERO:
        return y_int / (high * (high / low).ln()) * (
            _pow_positive(high / low, progress) - ONE
        )
    weighted_power = (
        (ONE - progress) * _pow_positive(high, alpha)
        + progress * _pow_positive(low, alpha)
    )
    return (
        y_int
        * alpha
        / (alpha - ONE)
        * (
            _pow_positive(weighted_power, (alpha - ONE) / alpha)
            - _pow_positive(high, alpha - ONE)
        )
        / (_pow_positive(low, alpha) - _pow_positive(high, alpha))
    )


def d_up(alpha: Decimal, before: Decimal, after: Decimal) -> Decimal:
    """Endpoint form of the native finite-traversal effective rate."""

    alpha = decimal(alpha)
    before = decimal(before)
    after = decimal(after)
    _require(before > ZERO and after > ZERO, "NONPOSITIVE_RATE", "mean endpoints must be positive")
    if before == after:
        return before
    if alpha == ONE:
        return (before - after) / (before.ln() - after.ln())
    if alpha == ZERO:
        return before * after * (before / after).ln() / (before - after)
    return (
        (alpha - ONE)
        / alpha
        * (
            (_pow_positive(before, alpha) - _pow_positive(after, alpha))
            / (
                _pow_positive(before, alpha - ONE)
                - _pow_positive(after, alpha - ONE)
            )
        )
    )


def d_down(alpha: Decimal, before: Decimal, after: Decimal) -> Decimal:
    """Displayed sell-side endpoint effective price law."""

    alpha = decimal(alpha)
    before = decimal(before)
    after = decimal(after)
    _require(before > ZERO and after > ZERO, "NONPOSITIVE_RATE", "mean endpoints must be positive")
    if before == after:
        return before
    if alpha == ZERO:
        return (before - after) / (before.ln() - after.ln())
    if alpha == -ONE:
        return before * after * (before / after).ln() / (before - after)
    return (
        alpha
        / (alpha + ONE)
        * (
            (_pow_positive(before, alpha + ONE) - _pow_positive(after, alpha + ONE))
            / (_pow_positive(before, alpha) - _pow_positive(after, alpha))
        )
    )


def displayed_price(curve: NativeCurve, native_rate: Decimal) -> Decimal:
    """Convert a native output-per-input rate to displayed quote per base."""

    native_rate = decimal(native_rate)
    _require(native_rate > ZERO, "NONPOSITIVE_RATE", "native rate must be positive")
    return native_rate if curve.side == SIDE_BUY else ONE / native_rate


def displayed_holder_price(curve: NativeCurve, progress: Decimal) -> Decimal:
    return displayed_price(curve, native_holder_rate(curve, progress))


def recover_y_int(
    curve: NativeCurve,
    y: Decimal,
    marginal_native_rate: Decimal,
) -> Decimal:
    """Recover runtime scale for a generalized interior initializer."""

    y = decimal(y)
    marginal_native_rate = decimal(marginal_native_rate)
    _require(not curve.is_flat, "FLAT_INTERIOR_UNDEFINED", "flat orders do not need interior recovery")
    _require(y > ZERO, "ZERO_RESERVE", "interior recovery requires positive reserve")
    if marginal_native_rate > curve.p_high and _approximately_equal(
        marginal_native_rate,
        curve.p_high,
    ):
        marginal_native_rate = curve.p_high
    _require(
        curve.p_low < marginal_native_rate <= curve.p_high,
        "MARGINAL_RATE_OUT_OF_RANGE",
        "interior marginal rate must satisfy PLow < P <= PHigh",
    )
    alpha = curve.alpha_native
    if alpha == ZERO:
        return y * (curve.p_high / curve.p_low).ln() / (marginal_native_rate / curve.p_low).ln()
    return y * (
        _pow_positive(curve.p_high, alpha) - _pow_positive(curve.p_low, alpha)
    ) / (
        _pow_positive(marginal_native_rate, alpha) - _pow_positive(curve.p_low, alpha)
    )


def _quote_from_state(
    curve: NativeCurve,
    y: Decimal,
    y_int: Decimal,
    y_after: Decimal,
) -> Quote:
    x_before = x_of_y(curve, y, y_int)
    x_after = x_of_y(curve, y_after, y_int)
    amount_in = x_after - x_before
    amount_out = y - y_after
    _require(amount_in > ZERO and amount_out > ZERO, "ZERO_AMOUNT", "quote amounts must be positive")
    native_before = native_marginal_rate(curve, y, y_int)
    native_after = native_marginal_rate(curve, y_after, y_int)
    native_effective = amount_out / amount_in
    return Quote(
        amount_in=amount_in,
        amount_out=amount_out,
        y_before=y,
        y_after=y_after,
        x_before=x_before,
        x_after=x_after,
        native_rate_before=native_before,
        native_rate_after=native_after,
        native_effective_rate=native_effective,
        displayed_price_before=displayed_price(curve, native_before),
        displayed_price_after=displayed_price(curve, native_after),
        displayed_effective_price=displayed_price(curve, native_effective),
    )


def quote_exact_output(
    curve: NativeCurve,
    y: Decimal,
    y_int: Decimal,
    amount_out: Decimal,
) -> Quote:
    """Quote exact outgoing amount by evaluating two integrated coordinates."""

    y, y_int = _validate_state(y, y_int)
    amount_out = decimal(amount_out)
    _require(amount_out > ZERO, "ZERO_AMOUNT", "amountOut must be positive")
    _require(amount_out <= y, "INSUFFICIENT_RESERVE", "amountOut exceeds live reserve")
    return _quote_from_state(curve, y, y_int, y - amount_out)


def quote_exact_input(
    curve: NativeCurve,
    y: Decimal,
    y_int: Decimal,
    amount_in: Decimal,
) -> Quote:
    """Quote exact incoming amount through the analytical inverse coordinate."""

    y, y_int = _validate_state(y, y_int)
    amount_in = decimal(amount_in)
    _require(amount_in > ZERO, "ZERO_AMOUNT", "amountIn must be positive")
    x_before = x_of_y(curve, y, y_int)
    x_after = x_before + amount_in
    capacity = x_of_y(curve, ZERO, y_int)
    _require(x_after <= capacity, "INPUT_EXCEEDS_CAPACITY", "amountIn exceeds remaining capacity")
    y_after = y_of_x(curve, x_after, y_int)
    return _quote_from_state(curve, y, y_int, y_after)


def recycle_inventory(
    y_before: Decimal,
    y_int_before: Decimal,
    received: Decimal,
) -> RecyclingResult:
    """Apply homothetic scaling or the explicit empty-side rearm policy."""

    y_before = decimal(y_before)
    y_int_before = decimal(y_int_before)
    received = decimal(received)
    _require(received > ZERO, "ZERO_RECEIVED", "recycling requires positive received inventory")
    _require(y_before >= ZERO and y_int_before >= ZERO, "NEGATIVE_STATE", "state cannot be negative")
    _require(y_before <= y_int_before, "STATE_OUT_OF_RANGE", "state must satisfy y <= yInt")
    if y_before == ZERO:
        return RecyclingResult("rearm", received, received, None)
    _require(y_int_before > ZERO, "NONPOSITIVE_SCALE", "nonempty reserve requires positive yInt")
    y_after = y_before + received
    scale = y_after / y_before
    return RecyclingResult("scale", y_after, y_int_before * scale, scale)


def split_path_cost(
    curve: NativeCurve,
    y: Decimal,
    y_int: Decimal,
    first_output: Decimal,
    second_output: Decimal,
) -> tuple[Decimal, Decimal]:
    """Return combined and sequential costs for path-consistency vectors."""

    first = quote_exact_output(curve, y, y_int, first_output)
    second = quote_exact_output(curve, first.y_after, y_int, second_output)
    combined = quote_exact_output(curve, y, y_int, first_output + second_output)
    return combined.amount_in, first.amount_in + second.amount_in


def decimal_string(value: Decimal, places: int = SERIALIZED_DECIMAL_PLACES) -> str:
    """Serialize a real value deterministically without exponent notation."""

    value = decimal(value)
    if value == ZERO:
        return "0"
    with localcontext() as context:
        context.prec = max(DECIMAL_PRECISION, places + max(0, value.adjusted()) + 16)
        quantum = ONE.scaleb(-places)
        rounded = value.quantize(quantum, rounding=ROUND_HALF_EVEN)
    text = format(rounded, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return "0" if text in ("-0", "") else text


def wad_rounding_interval(value: Decimal) -> dict[str, str]:
    """Return the adjacent WAD integers enclosing an ideal real value."""

    scaled = decimal(value) * WAD
    floor_value = scaled.to_integral_value(rounding=ROUND_FLOOR)
    ceiling_value = scaled.to_integral_value(rounding=ROUND_CEILING)
    return {
        "floor": str(floor_value),
        "ceiling": str(ceiling_value),
    }


def encode_unsigned_wad(value: Decimal, rounding: Literal["floor", "ceiling"]) -> int:
    """Apply one directional WAD rounding and enforce the uint128 wire domain."""

    value = decimal(value)
    _require(rounding in ("floor", "ceiling"), "INVALID_ROUNDING_MODE", "rounding must be floor or ceiling")
    _require(value >= ZERO, "NEGATIVE_UNSIGNED_WAD", "unsigned WAD values cannot be negative")
    mode = ROUND_FLOOR if rounding == "floor" else ROUND_CEILING
    encoded = int((value * WAD).to_integral_value(rounding=mode))
    _require(encoded <= UINT128_MAX, "UNSIGNED_WAD_OVERFLOW", "value does not fit uint128 WAD")
    return encoded


def encode_signed_wad(value: Decimal, rounding: Literal["floor", "ceiling"]) -> int:
    """Apply one directional WAD rounding and enforce the int128 wire domain."""

    value = decimal(value)
    _require(rounding in ("floor", "ceiling"), "INVALID_ROUNDING_MODE", "rounding must be floor or ceiling")
    mode = ROUND_FLOOR if rounding == "floor" else ROUND_CEILING
    encoded = int((value * WAD).to_integral_value(rounding=mode))
    _require(
        INT128_MIN <= encoded <= INT128_MAX,
        "SIGNED_WAD_OVERFLOW",
        "value does not fit int128 WAD",
    )
    return encoded
