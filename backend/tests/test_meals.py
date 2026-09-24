from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, Food, MealEntry
from app.schemas import MealCreateRequest, MealUpdateRequest
from app.services.meals import (
    MealConflictError,
    MealError,
    create_meal,
    delete_meal,
    list_meals,
    update_meal,
)


@pytest.fixture
def db() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add_all(
            [
                Food(
                    id="food-apple",
                    name="Alma",
                    original_name="Apple, raw",
                    normalized_name="alma apple raw",
                    brand=None,
                    source="usda",
                    source_id="meal-apple",
                    available_carbs_100g=11.4,
                    is_generic=True,
                    is_verified=False,
                    category="ingredient",
                    source_payload={
                        "mapping_version": 4,
                        "total_carbohydrate_100g": 13.8,
                        "dietary_fiber_100g": 2.4,
                        "nutrient_ids": {"total_carbohydrate": 1005, "dietary_fiber": 1079},
                        "nutrient_values": {"1005": 13.8, "1079": 2.4},
                    },
                ),
                Food(
                    id="food-banana",
                    name="Banán",
                    original_name="Banana, raw",
                    normalized_name="banan banana raw",
                    source="usda",
                    source_id="meal-banana",
                    available_carbs_100g=21.0,
                    is_generic=True,
                    is_verified=False,
                    category="ingredient",
                    source_payload={"mapping_version": 4, "total_carbohydrate_100g": 22.8},
                ),
                Food(
                    id="food-null",
                    name="Ismeretlen CH",
                    original_name="Missing carbohydrate",
                    normalized_name="ismeretlen ch",
                    source="open_food_facts",
                    source_id="meal-null",
                    available_carbs_100g=None,
                    is_generic=False,
                    is_verified=False,
                    category="other",
                    source_payload={},
                ),
            ]
        )
        session.commit()
        yield session
    engine.dispose()


def _request(**overrides: object) -> MealCreateRequest:
    values: dict[str, object] = {
        "food_id": "food-apple",
        "amount_g": 55,
        "consumed_at": "2026-01-01T23:30:00+01:00",
        "timezone": "Europe/Budapest",
        "idempotency_key": "meal-test-0001",
    }
    values.update(overrides)
    return MealCreateRequest.model_validate(values)


def test_snapshot_is_immutable_and_idempotency_is_safe(db: Session) -> None:
    created = create_meal(db, _request())
    assert created.local_date == date(2026, 1, 1)
    assert created.calculated_carbs_g == pytest.approx(6.27)
    assert created.snapshot["name"] == "Alma"
    assert created.snapshot["original_name"] == "Apple, raw"
    assert created.snapshot["source"] == "usda"
    assert created.snapshot["source_id"] == "meal-apple"
    assert created.snapshot["available_carbs_100g"] == 11.4
    assert created.snapshot["nutrient_ids"]["total_carbohydrate"] == 1005

    retry = create_meal(db, _request())
    assert retry.id == created.id
    with pytest.raises(MealConflictError):
        create_meal(db, _request(amount_g=56))

    food = db.get(Food, "food-apple")
    assert food is not None
    food.name = "Alma frissítve"
    food.available_carbs_100g = 20
    db.commit()

    edited = update_meal(db, created.id, MealUpdateRequest(amount_g=100))
    assert edited.calculated_carbs_g == pytest.approx(11.4)
    assert edited.snapshot["name"] == "Alma"
    assert edited.snapshot["available_carbs_100g"] == 11.4

    moved = update_meal(
        db,
        created.id,
        MealUpdateRequest(consumed_at="2026-01-02T01:30:00+01:00"),
    )
    assert moved.local_date == date(2026, 1, 2)

    changed_food = update_meal(db, created.id, MealUpdateRequest(food_id="food-banana"))
    assert changed_food.snapshot["name"] == "Banán"
    assert changed_food.snapshot["available_carbs_100g"] == 21
    assert changed_food.calculated_carbs_g == pytest.approx(21)


def test_timezone_offset_missing_nutrients_and_empty_day(db: Session) -> None:
    with pytest.raises(MealError, match="explicit"):
        create_meal(db, _request(consumed_at="2026-01-01T12:00:00"))
    with pytest.raises(MealError, match="nem számolható"):
        create_meal(db, _request(food_id="food-null", idempotency_key="meal-test-null"))
    with pytest.raises(MealError, match="kliens"):
        create_meal(db, _request(idempotency_key="meal-test-fake", client_carbs_g=99))

    items, total = list_meals(db, date(2026, 2, 1))
    assert items == []
    assert total == 0


def test_delete_removes_entry_and_does_not_delete_food(db: Session) -> None:
    created = create_meal(db, _request(idempotency_key="meal-test-delete"))
    delete_meal(db, created.id)
    assert db.scalar(select(MealEntry).where(MealEntry.id == created.id)) is None
    assert db.get(Food, "food-apple") is not None
