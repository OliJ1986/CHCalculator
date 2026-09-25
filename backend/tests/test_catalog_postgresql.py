from __future__ import annotations

import os
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from app.db import get_db
from app.main import app
from app.models import CustomFood, Food, MealPlanEntry, Recipe, ShoppingItem, User

POSTGRES_TEST_URL = os.environ.get("CHILL_TEST_DATABASE_URL", "")
pytestmark = pytest.mark.postgresql


@pytest.mark.skipif(not POSTGRES_TEST_URL.startswith(("postgresql", "postgres")), reason="CHILL_TEST_DATABASE_URL nincs izolált PostgreSQL test DB-re állítva")
def test_catalog_api_crud_and_profile_scope_on_postgresql() -> None:
    if "test" not in POSTGRES_TEST_URL.rsplit("/", 1)[-1].lower(): pytest.skip("A cél adatbázis nevében szerepeljen a test jelölés")
    engine = create_engine(POSTGRES_TEST_URL, future=True)
    email = "m8-pg-catalog@example.test"
    def override_get_db():
        with Session(engine) as db: yield db
    app.dependency_overrides[get_db] = override_get_db
    try:
        with Session(engine) as db:
            db.execute(delete(User).where(User.email == email)); db.commit()
        with TestClient(app) as client:
            registration = client.post("/api/auth/register", json={"email": email, "password": "Correct Horse Battery 1!"})
            assert registration.status_code == 202
            assert client.post("/api/auth/verify-email", json={"token": registration.json()["verification_token"]}).status_code == 200
            assert client.post("/api/auth/login", json={"email": email, "password": "Correct Horse Battery 1!"}).status_code == 200
            csrf = client.cookies.get("chill_csrf")
            created = client.post("/api/custom-foods", json={"name": "PG saját", "available_carbs_100g": 14.5}, headers={"X-CSRF-Token": csrf})
            assert created.status_code == 201, created.text
            food_id = created.json()["id"]
            assert client.get("/api/custom-foods").json()[0]["name"] == "PG saját"
            recipe = client.post("/api/recipes", json={"name": "PG recept", "servings": 2, "ingredients":[{"custom_food_id": food_id, "quantity_g": 200}]}, headers={"X-CSRF-Token": csrf})
            assert recipe.status_code == 201 and recipe.json()["total_carbs_g"] == pytest.approx(29)
            recipe_id = recipe.json()["id"]
            plan = client.post("/api/plans", json={"plan_date": "2099-09-25", "recipe_id": recipe_id, "quantity": 1, "quantity_unit": "servings"}, headers={"X-CSRF-Token": csrf})
            assert plan.status_code == 201 and plan.json()["planned_carbs_g"] == pytest.approx(14.5)
            shopping = client.post("/api/shopping-list", json={"name": "PG saját", "quantity": 200, "unit": "g"}, headers={"X-CSRF-Token": csrf})
            assert shopping.status_code == 201
            assert client.delete(f"/api/custom-foods/{food_id}", headers={"X-CSRF-Token": csrf}).status_code == 204
            assert client.get(f"/api/recipes/{recipe_id}").status_code == 200
    finally:
        app.dependency_overrides.pop(get_db, None)
        with Session(engine) as db:
            db.execute(delete(User).where(User.email == email)); db.commit()
        engine.dispose()
