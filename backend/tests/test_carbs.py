import math

import pytest
from fastapi.testclient import TestClient

from app.domain.carbs import CarbohydrateInputError, calculate_carbohydrate
from app.main import app


def test_calculate_carbohydrate_uses_unrounded_values() -> None:
    assert calculate_carbohydrate(55, 11.4) == pytest.approx(6.27)
    assert calculate_carbohydrate(100, 11.4) == pytest.approx(11.4)
    assert calculate_carbohydrate(55, 0) == 0


@pytest.mark.parametrize("amount", [0, -1, "", "abc", math.nan, math.inf, 100_001])
def test_invalid_amount_is_rejected(amount: object) -> None:
    with pytest.raises(CarbohydrateInputError):
        calculate_carbohydrate(amount, 11.4)


@pytest.mark.parametrize("carbs", [None, -1, 100.1, math.nan, math.inf])
def test_missing_or_invalid_carbs_is_rejected(carbs: object) -> None:
    with pytest.raises(CarbohydrateInputError):
        calculate_carbohydrate(55, carbs)


def test_calculation_endpoint_validates_and_returns_exact_result() -> None:
    client = TestClient(app)
    response = client.post("/api/carbs/calculate", json={"amount_g": 55, "available_carbs_100g": 11.4})
    assert response.status_code == 200
    assert response.json()["carbs_g"] == pytest.approx(6.27)

    invalid = client.post("/api/carbs/calculate", json={"amount_g": 0, "available_carbs_100g": 11.4})
    assert invalid.status_code == 422

    missing = client.post("/api/carbs/calculate", json={"amount_g": 55, "available_carbs_100g": None})
    assert missing.status_code == 422
