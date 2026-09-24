import asyncio

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import Session

from app.domain.foods import FoodCandidate, map_open_food_facts_product, normalize_query
from app.main import app
from app.models import Base, Food
from app.providers.open_food_facts import OpenFoodFactsProvider
from app.services.foods import FoodService


def off_product(**overrides: object) -> dict:
    product: dict = {
        "code": "1234567890123",
        "product_name": "Apple snack",
        "product_name_hu": "Almás snack",
        "brands": "Minta, Második márka",
        "nutriments": {"carbohydrates_100g": 12.4},
        "serving_size": "30 g",
        "image_front_small_url": "https://example.com/apple.jpg",
        "countries_tags": ["en:hungary"],
        "lang": "hu",
    }
    product.update(overrides)
    return product


def test_off_mapping_prefers_hungarian_name_and_carbs() -> None:
    candidate = map_open_food_facts_product(off_product())

    assert candidate is not None
    assert candidate.name == "Almás snack"
    assert candidate.brand == "Minta"
    assert candidate.available_carbs_100g == 12.4
    assert candidate.serving_size_g == 30
    assert candidate.country == "hungary"


def test_off_mapping_falls_back_to_product_name() -> None:
    candidate = map_open_food_facts_product(off_product(product_name_hu=""))

    assert candidate is not None
    assert candidate.name == "Apple snack"


def test_invalid_off_carbs_are_not_calculable() -> None:
    for carbs in (None, "12.4", -1, 101):
        candidate = map_open_food_facts_product(
            off_product(nutriments={"carbohydrates_100g": carbs})
        )
        assert candidate is not None
        assert candidate.available_carbs_100g is None


def test_open_food_facts_provider_uses_limited_fields_and_app_user_agent() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/cgi/search.pl"
        assert request.headers["user-agent"].startswith("CHill/")
        assert "nutriments" in request.url.params["fields"]
        return httpx.Response(200, json={"products": [off_product()]})

    provider = OpenFoodFactsProvider(transport=httpx.MockTransport(handler))
    candidates = asyncio.run(provider.search("alma", limit=5))

    assert len(candidates) == 1
    assert candidates[0].source == "open_food_facts"


def test_open_food_facts_search_normalizes_accented_compound_query() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["search_terms"] == "activia banan"
        return httpx.Response(200, json={"products": []})

    provider = OpenFoodFactsProvider(transport=httpx.MockTransport(handler))

    assert asyncio.run(provider.search("Activia banán", limit=5)) == []


def test_query_normalization_handles_accents_case_and_whitespace() -> None:
    assert normalize_query("  TELJES   KIŐRLÉSŰ ") == "teljes kiorlesu"
    assert normalize_query("Áfonya") == "afonya"


class FakeProvider:
    def __init__(self, candidates: list[FoodCandidate]) -> None:
        self.candidates = candidates
        self.search_calls = 0

    async def search(self, query: str, limit: int = 20) -> list[FoodCandidate]:
        self.search_calls += 1
        return self.candidates[:limit]

    async def get_by_id(self, external_id: str) -> FoodCandidate | None:
        return None

    async def get_by_barcode(self, barcode: str) -> FoodCandidate | None:
        return next((candidate for candidate in self.candidates if candidate.barcode == barcode), None)


def test_cache_deduplicates_same_provider_product() -> None:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    provider = FakeProvider(
        [
            FoodCandidate(
                source="open_food_facts",
                source_id="123",
                name="Alma",
                barcode="123",
                available_carbs_100g=11.4,
            ),
            FoodCandidate(
                source="open_food_facts",
                source_id="123",
                name="Alma",
                barcode="123",
                available_carbs_100g=11.4,
            ),
        ]
    )

    with Session(engine) as db:
        foods = asyncio.run(FoodService(provider).search(db, "alma", limit=20))
        count = db.scalar(select(func.count()).select_from(Food))

    assert len(foods) == 1
    assert count == 1
    assert provider.search_calls == 1


def test_search_endpoint_returns_internal_food_dto() -> None:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    provider = FakeProvider(
        [
            FoodCandidate(
                source="open_food_facts",
                source_id="123",
                name="Alma",
                barcode="123",
                available_carbs_100g=11.4,
            )
        ]
    )
    from app import main
    from app.db import get_db

    def override_db():
        with Session(engine) as db:
            yield db

    original_service = main.food_service
    main.food_service = FoodService(provider)
    app.dependency_overrides[get_db] = override_db
    try:
        response = TestClient(app).get("/api/foods/search?q=alma")
    finally:
        main.food_service = original_service
        app.dependency_overrides.clear()

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["name"] == "Alma"
    assert item["available_carbs_100g"] == 11.4
    assert item["carbs_available"] is True
    assert "nutriments" not in item
