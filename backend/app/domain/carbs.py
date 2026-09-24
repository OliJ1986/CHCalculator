from __future__ import annotations

import math
from numbers import Real

MAX_AMOUNT_G = 100_000.0
MAX_CARBS_PER_100G = 100.0


class CarbohydrateInputError(ValueError):
    """Raised when a carbohydrate calculation input cannot be accepted."""


def _finite_number(value: object, *, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, Real):
        raise CarbohydrateInputError(f"{field} must be a finite number")
    numeric = float(value)
    if not math.isfinite(numeric):
        raise CarbohydrateInputError(f"{field} must be a finite number")
    return numeric


def validate_amount_g(value: object) -> float:
    amount = _finite_number(value, field="amount_g")
    if amount <= 0:
        raise CarbohydrateInputError("amount_g must be greater than zero")
    if amount > MAX_AMOUNT_G:
        raise CarbohydrateInputError(f"amount_g must be at most {MAX_AMOUNT_G:g}")
    return amount


def validate_available_carbs_100g(value: object) -> float:
    carbs = _finite_number(value, field="available_carbs_100g")
    if carbs < 0 or carbs > MAX_CARBS_PER_100G:
        raise CarbohydrateInputError(
            f"available_carbs_100g must be between 0 and {MAX_CARBS_PER_100G:g}"
        )
    return carbs


def calculate_carbohydrate(amount_g: object, available_carbs_100g: object) -> float:
    amount = validate_amount_g(amount_g)
    carbs = validate_available_carbs_100g(available_carbs_100g)
    return amount * carbs / 100
