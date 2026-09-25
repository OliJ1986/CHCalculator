from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.db import get_db
from app.main import app
from app.models import Base


def _client():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)

    def override():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = override
    return TestClient(app), engine


def test_guest_cannot_use_shared_profile_api():
    client, engine = _client()
    try:
        assert client.get("/api/auth/me").json()["status"] == "guest"
        assert client.get("/api/meals").status_code == 401
        assert client.get("/api/goals").status_code == 401
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


def test_account_csrf_and_guest_import_are_idempotent():
    client, engine = _client()
    try:
        registration = client.post(
            "/api/auth/register",
            json={"email": "m5-test@example.test", "password": "Correct Horse Battery 1!"},
        )
        assert registration.status_code == 202
        token = registration.json()["verification_token"]
        assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200
        login = client.post(
            "/api/auth/login",
            json={"email": "m5-test@example.test", "password": "Correct Horse Battery 1!"},
        )
        assert login.status_code == 200
        csrf = client.cookies.get("chill_csrf")
        assert csrf
        payload = {
            "meals": [
                {
                    "id": "guest-meal-1",
                    "consumed_at": datetime(2026, 9, 25, 12, tzinfo=timezone.utc).isoformat(),
                    "local_date": "2026-09-25",
                    "timezone": "Europe/Budapest",
                    "amount_g": 100,
                    "meal_category": "lunch",
                    "snapshot": {
                        "snapshot_version": 1,
                        "name": "Teszt alma",
                        "available_carbs_100g": 12.5,
                    },
                }
            ],
            "goals": [
                {
                    "effective_date": "2026-09-25",
                    "daily_target_g": 160,
                    "meal_targets": {"lunch": 50},
                    "allow_past": True,
                }
            ],
        }
        first = client.post("/api/auth/import-guest", json=payload, headers={"X-CSRF-Token": csrf})
        assert first.status_code == 200, first.text
        assert first.json() == {"imported_meals": 1, "skipped_meals": 0, "imported_goals": 1, "skipped_goals": 0}
        second = client.post("/api/auth/import-guest", json=payload, headers={"X-CSRF-Token": csrf})
        assert second.status_code == 200
        assert second.json() == {"imported_meals": 0, "skipped_meals": 1, "imported_goals": 0, "skipped_goals": 1}
        assert client.get("/api/meals", params={"local_date": "2026-09-25"}).json()["total_carbs_g"] == 12.5
        changed = {**payload, "meals": [{**payload["meals"][0], "amount_g": 101}]}
        assert client.post("/api/auth/import-guest", json=changed, headers={"X-CSRF-Token": csrf}).status_code == 409
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()
