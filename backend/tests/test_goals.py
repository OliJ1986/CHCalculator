from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, Food
from app.schemas import GoalUpsertRequest, MealCreateRequest
from app.services.goals import GoalError, summary, upsert_goal
from app.services.meals import create_meal


@pytest.fixture
def db() -> Session:
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(
            Food(
                id="goal-food",
                name="Teszt étel",
                original_name="Goal test food",
                normalized_name="teszt etel",
                source="usda",
                source_id="goal-source",
                available_carbs_100g=100,
                is_generic=True,
                is_verified=False,
                category="ingredient",
                source_payload={"mapping_version": 4},
            )
        )
        session.commit()
        yield session
    engine.dispose()


def _meal(key: str, amount: float, category: str, local_date: str = "2026-09-25") -> MealCreateRequest:
    return MealCreateRequest.model_validate(
        {
            "food_id": "goal-food",
            "amount_g": amount,
            "local_date": local_date,
            "consumed_at": "2026-09-25T12:00:00+02:00",
            "timezone": "Europe/Budapest",
            "meal_category": category,
            "idempotency_key": key,
        }
    )


def test_goal_summary_is_deterministic_and_categories_reconcile(db: Session) -> None:
    create_meal(db, _meal("goal-breakfast", 50, "breakfast"))
    create_meal(db, _meal("goal-lunch", 34, "lunch"))
    goal = upsert_goal(
        db,
        GoalUpsertRequest(
            effective_date=date(2026, 9, 25),
            daily_target_g=160,
            meal_targets={"breakfast": 50, "lunch": 40},
        ),
    )
    assert goal.has_goal is True
    result = summary(db, date(2026, 9, 25))
    assert result.consumed_carbs_g == pytest.approx(84)
    assert result.remaining_carbs_g == pytest.approx(76)
    assert result.progress_ratio == pytest.approx(0.525)
    assert result.progress_percent == pytest.approx(52.5)
    assert sum(category.consumed_carbs_g for category in result.categories) == pytest.approx(84)
    breakfast = next(category for category in result.categories if category.key == "breakfast")
    assert breakfast.target_g == pytest.approx(50)
    assert breakfast.remaining_g == pytest.approx(0)
    create_meal(db, _meal("goal-overrun", 91, "other"))
    overrun = summary(db, date(2026, 9, 25))
    assert overrun.consumed_carbs_g == pytest.approx(175)
    assert overrun.remaining_carbs_g == pytest.approx(-15)
    assert overrun.progress_ratio == pytest.approx(1.09375)
    assert overrun.progress_percent == pytest.approx(100)


def test_goal_versions_preserve_previous_days_and_explicit_past(db: Session) -> None:
    with pytest.raises(GoalError, match="Múltbeli"):
        upsert_goal(db, GoalUpsertRequest(effective_date=date(2020, 1, 1), daily_target_g=120))
    upsert_goal(db, GoalUpsertRequest(effective_date=date(2026, 9, 25), daily_target_g=160))
    upsert_goal(db, GoalUpsertRequest(effective_date=date(2026, 9, 26), daily_target_g=175))
    assert summary(db, date(2026, 9, 25)).daily_target_g == pytest.approx(160)
    assert summary(db, date(2026, 9, 26)).daily_target_g == pytest.approx(175)
    upsert_goal(db, GoalUpsertRequest(effective_date=date(2020, 1, 1), daily_target_g=100, allow_past=True))
    assert summary(db, date(2020, 1, 2)).daily_target_g == pytest.approx(100)


def test_goal_deletion_and_invalid_values_are_not_zero_targets(db: Session) -> None:
    upsert_goal(db, GoalUpsertRequest(effective_date=date(2026, 9, 25), daily_target_g=160))
    upsert_goal(db, GoalUpsertRequest(effective_date=date(2026, 9, 25), daily_target_g=None, meal_targets={}))
    result = summary(db, date(2026, 9, 25))
    assert result.daily_target_g is None
    assert result.remaining_carbs_g is None
    assert result.progress_ratio is None
    with pytest.raises(GoalError):
        upsert_goal(db, GoalUpsertRequest(effective_date=date(2026, 9, 25), daily_target_g=0))
    with pytest.raises(GoalError):
        upsert_goal(db, GoalUpsertRequest(effective_date=date(2026, 9, 25), meal_targets={"unknown": 10}))
