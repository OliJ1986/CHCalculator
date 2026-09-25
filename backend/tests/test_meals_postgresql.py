from __future__ import annotations

import os
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from app.main import app
from app.db import get_db
from app.models import Food, GoalVersion, MealEntry, User


POSTGRES_TEST_URL = os.environ.get("CHILL_TEST_DATABASE_URL", "")
pytestmark = pytest.mark.postgresql


def _authenticate(client: TestClient, email: str) -> str:
    registration = client.post(
        "/api/auth/register",
        json={"email": email, "password": "Correct Horse Battery 1!"},
    )
    assert registration.status_code == 202, registration.text
    verification = registration.json().get("verification_token")
    assert verification
    assert client.post("/api/auth/verify-email", json={"token": verification}).status_code == 200
    login = client.post(
        "/api/auth/login",
        json={"email": email, "password": "Correct Horse Battery 1!"},
    )
    assert login.status_code == 200, login.text
    csrf = client.cookies.get("chill_csrf")
    assert csrf
    return csrf


@pytest.mark.skipif(
    not POSTGRES_TEST_URL.startswith(("postgresql", "postgres")),
    reason="CHILL_TEST_DATABASE_URL nincs izolált PostgreSQL test DB-re állítva",
)
def test_meal_api_crud_snapshot_and_timezone_on_real_postgresql() -> None:
    if "test" not in POSTGRES_TEST_URL.rsplit("/", 1)[-1].lower():
        pytest.skip("A PostgreSQL cél adatbázis nevében szerepeljen a test jelölés")

    engine = create_engine(POSTGRES_TEST_URL, future=True)
    food_id = "m3-pg-food"
    source_id = "m3-pg-source"

    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    email = "m5-pg-meals@example.test"
    try:
        with Session(engine) as db:
            db.execute(delete(MealEntry).where(MealEntry.food_id == food_id))
            db.execute(delete(Food).where(Food.id == food_id))
            db.commit()
            db.add(
                Food(
                    id=food_id,
                    name="M3 teszt alma",
                    original_name="M3 test apple",
                    normalized_name="m3 teszt alma",
                    source="usda",
                    source_id=source_id,
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
                )
            )
            db.commit()

        with TestClient(app) as client:
            csrf = _authenticate(client, email)
            response = client.post(
                "/api/meals",
                json={
                    "food_id": food_id,
                    "amount_g": 55,
                    "consumed_at": "2026-03-29T23:30:00+02:00",
                    "timezone": "Europe/Budapest",
                    "meal_category": "other",
                    "idempotency_key": "m3-pg-idempotency-1",
                },
                headers={"X-CSRF-Token": csrf},
            )
            assert response.status_code == 201, response.text
            created = response.json()
            meal_id = created["id"]
            assert created["local_date"] == "2026-03-29"
            assert created["calculated_carbs_g"] == pytest.approx(6.27)
            assert created["snapshot"]["source_id"] == source_id

            retry = client.post(
                "/api/meals",
                json={
                    "food_id": food_id,
                    "amount_g": 55,
                    "consumed_at": "2026-03-29T23:30:00+02:00",
                    "timezone": "Europe/Budapest",
                    "meal_category": "other",
                    "idempotency_key": "m3-pg-idempotency-1",
                },
                headers={"X-CSRF-Token": csrf},
            )
            assert retry.status_code == 201
            assert retry.json()["id"] == meal_id

            listed = client.get("/api/meals", params={"local_date": "2026-03-29"})
            assert listed.status_code == 200
            assert listed.json()["total_carbs_g"] == pytest.approx(6.27)
            assert len(listed.json()["items"]) == 1

            patched = client.patch(
                f"/api/meals/{meal_id}",
                json={"amount_g": 100, "consumed_at": "2026-03-30T01:30:00+02:00"},
                headers={"X-CSRF-Token": csrf},
            )
            assert patched.status_code == 200, patched.text
            assert patched.json()["local_date"] == "2026-03-30"
            assert patched.json()["calculated_carbs_g"] == pytest.approx(11.4)

            empty = client.get("/api/meals", params={"local_date": "2026-03-29"})
            assert empty.status_code == 200
            assert empty.json() == {"items": [], "total_carbs_g": 0.0}

            deleted = client.delete(f"/api/meals/{meal_id}", headers={"X-CSRF-Token": csrf})
            assert deleted.status_code == 204
            assert client.get("/api/meals", params={"local_date": "2026-03-30"}).json() == {
                "items": [],
                "total_carbs_g": 0.0,
            }
    finally:
        app.dependency_overrides.pop(get_db, None)
        with Session(engine) as db:
            db.execute(delete(MealEntry).where(MealEntry.food_id == food_id))
            db.execute(delete(Food).where(Food.id == food_id))
            db.execute(delete(User).where(User.email == email))
            db.commit()
        engine.dispose()


@pytest.mark.skipif(
    not POSTGRES_TEST_URL.startswith(("postgresql", "postgres")),
    reason="CHILL_TEST_DATABASE_URL nincs izolált PostgreSQL test DB-re állítva",
)
def test_goal_versions_and_categories_on_real_postgresql() -> None:
    if "test" not in POSTGRES_TEST_URL.rsplit("/", 1)[-1].lower():
        pytest.skip("A PostgreSQL cél adatbázis nevében szerepeljen a test jelölés")
    engine = create_engine(POSTGRES_TEST_URL, future=True)
    effective_dates = [date(2020, 1, 1), date(2099, 1, 1), date(2099, 1, 2)]

    def override_get_db():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    email = "m5-pg-goals@example.test"
    try:
        with TestClient(app) as client:
            csrf = _authenticate(client, email)
            denied = client.put(
                "/api/goals",
                json={"effective_date": "2020-01-01", "daily_target_g": 120, "meal_targets": {}},
                headers={"X-CSRF-Token": csrf},
            )
            assert denied.status_code == 422
            first = client.put(
                "/api/goals",
                json={
                    "effective_date": "2099-01-01",
                    "daily_target_g": 160,
                    "meal_targets": {"breakfast": 50, "lunch": 40},
                },
                headers={"X-CSRF-Token": csrf},
            )
            assert first.status_code == 200, first.text
            assert first.json()["has_goal"] is True
            second = client.put(
                "/api/goals",
                json={"effective_date": "2099-01-02", "daily_target_g": 175, "meal_targets": {}},
                headers={"X-CSRF-Token": csrf},
            )
            assert second.status_code == 200
            old = client.get("/api/goals/summary", params={"local_date": "2099-01-01"})
            assert old.status_code == 200
            assert old.json()["daily_target_g"] == 160
            assert old.json()["progress_ratio"] == 0
            current = client.get("/api/goals/summary", params={"local_date": "2099-01-02"})
            assert current.status_code == 200
            assert current.json()["daily_target_g"] == 175
            assert len(current.json()["categories"]) == 6
            past = client.put(
                "/api/goals",
                json={"effective_date": "2020-01-01", "daily_target_g": 120, "meal_targets": {}, "allow_past": True},
                headers={"X-CSRF-Token": csrf},
            )
            assert past.status_code == 200
            cleared = client.put(
                "/api/goals",
                json={"effective_date": "2099-01-02", "daily_target_g": None, "meal_targets": {}},
                headers={"X-CSRF-Token": csrf},
            )
            assert cleared.status_code == 200
            assert cleared.json()["has_goal"] is False
    finally:
        app.dependency_overrides.pop(get_db, None)
        with Session(engine) as db:
            db.query(GoalVersion).filter(GoalVersion.effective_date.in_(effective_dates)).delete(synchronize_session=False)
            db.execute(delete(User).where(User.email == email))
            db.commit()
        engine.dispose()
