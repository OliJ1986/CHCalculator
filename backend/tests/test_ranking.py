import asyncio

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.domain.foods import CATEGORY_INGREDIENT, CATEGORY_PROCESSED, FoodCandidate
from app.models import Base, Food
from app.providers.base import FoodProviderError
from app.services.foods import FoodService
from app.services.ranking import rank_foods


class StaticProvider:
    def __init__(self, candidates: list[FoodCandidate]) -> None:
        self.candidates = candidates
        self.calls = 0
        self.queries: list[str] = []

    async def search(self, query: str, limit: int = 20) -> list[FoodCandidate]:
        self.calls += 1
        self.queries.append(query)
        return self.candidates[:limit]

    async def get_by_id(self, external_id: str) -> FoodCandidate | None:
        return None

    async def get_by_barcode(self, barcode: str) -> FoodCandidate | None:
        return None


class FailingProvider:
    async def search(self, query: str, limit: int = 20) -> list[FoodCandidate]:
        raise FoodProviderError("provider unavailable")

    async def get_by_id(self, external_id: str) -> FoodCandidate | None:
        raise FoodProviderError("provider unavailable")

    async def get_by_barcode(self, barcode: str) -> FoodCandidate | None:
        raise FoodProviderError("provider unavailable")


def db_session() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return Session(engine)


def candidate(source: str, source_id: str, name: str, *, generic: bool, brand: str | None = None) -> FoodCandidate:
    return FoodCandidate(
        source=source,
        source_id=source_id,
        name=name,
        brand=brand,
        available_carbs_100g=11.4,
        is_generic=generic,
    )


def test_generic_usda_apple_ranks_above_off_product() -> None:
    off = StaticProvider([candidate("open_food_facts", "off-1", "Almás ital", generic=False, brand="Márka")])
    usda = StaticProvider([candidate("usda", "9001", "Alma, nyers, héjjal", generic=True)])

    with db_session() as db:
        foods = asyncio.run(FoodService(off, usda).search(db, "alma"))

    assert foods[0].source == "usda"
    assert off.calls == 1
    assert usda.calls == 1
    assert foods[0].name == "Alma, nyers, héjjal"


def test_exact_branded_nutella_ranks_above_generic_result() -> None:
    off = StaticProvider([candidate("open_food_facts", "off-1", "Nutella", generic=False, brand="Ferrero")])
    usda = StaticProvider([candidate("usda", "9001", "Chocolate hazelnut spread", generic=True)])

    with db_session() as db:
        foods = asyncio.run(FoodService(off, usda).search(db, "Nutella"))

    assert foods[0].source == "open_food_facts"


def test_provider_failure_does_not_hide_other_provider_results() -> None:
    off = StaticProvider([candidate("open_food_facts", "off-1", "Alma", generic=False)])

    with db_session() as db:
        foods = asyncio.run(FoodService(off, FailingProvider()).search(db, "alma"))

    assert [food.name for food in foods] == ["Alma"]


def test_cache_is_used_for_a_follow_up_limited_search() -> None:
    provider = StaticProvider([candidate("usda", "9001", "Alma, nyers", generic=True)])

    with db_session() as db:
        service = FoodService(provider)
        first = asyncio.run(service.search(db, "alma", limit=1))
        second = asyncio.run(service.search(db, "alma", limit=1))

    assert first[0].source == "usda"
    assert second[0].source == "usda"
    assert provider.calls == 2


def test_local_cache_does_not_skip_combined_provider_calls() -> None:
    off = StaticProvider([candidate("open_food_facts", "off-1", "Alma", generic=False)])
    usda = StaticProvider([candidate("usda", "9001", "Apple, raw", generic=True)])

    with db_session() as db:
        db.add(Food(name="Cached Alma", normalized_name="alma", source="open_food_facts", source_id="cached", available_carbs_100g=11.4))
        db.commit()
        asyncio.run(FoodService(off, usda).search(db, "alma", limit=1))

    assert off.calls == 1
    assert usda.calls == 1


def test_cache_survives_when_both_providers_fail() -> None:
    with db_session() as db:
        db.add(Food(name="Alma", normalized_name="alma", source="usda", source_id="9001", available_carbs_100g=11.4))
        db.commit()
        foods = asyncio.run(FoodService(FailingProvider(), FailingProvider()).search(db, "alma"))

    assert len(foods) == 1
    assert foods[0].name == "Alma"


def test_same_usda_fdc_id_is_deduplicated_but_different_ids_are_kept() -> None:
    first = StaticProvider([candidate("usda", "9001", "Banán, nyers", generic=True)])
    same_id = StaticProvider([candidate("usda", "9001", "Bananas, raw", generic=True)])
    different_id = StaticProvider([candidate("usda", "9002", "Banán, túlérett", generic=True)])

    with db_session() as db:
        same_id_results = asyncio.run(FoodService(first, same_id).search(db, "banán"))
        all_results = asyncio.run(FoodService(first, different_id).search(db, "banán"))

    assert len([food for food in same_id_results if food.source_id == "9001"]) == 1
    assert {food.source_id for food in all_results} == {"9001", "9002"}


def test_simple_alias_ranking_handles_punctuation_and_excludes_banana_pepper() -> None:
    raw_banana = Food(
        source="usda",
        source_id="raw",
        name="Banán, nyers",
        original_name="Banana, raw",
        normalized_name="banan nyers banana raw",
        available_carbs_100g=21.01,
        is_generic=True,
        category=CATEGORY_INGREDIENT,
    )
    banana_pepper = Food(
        source="usda",
        source_id="pepper",
        name="Paprika, banánpaprika, nyers",
        original_name="Pepper, banana, raw",
        normalized_name="paprika bananpaprika nyers pepper banana raw",
        available_carbs_100g=1.95,
        is_generic=True,
        category=CATEGORY_INGREDIENT,
    )
    banana_product = Food(
        source="open_food_facts",
        source_id="brand",
        name="Banana snack",
        original_name="Banana snack",
        normalized_name="banana snack",
        brand="Bananas Example",
        available_carbs_100g=22,
        category=CATEGORY_PROCESSED,
    )

    ranked = rank_foods("banán", [banana_product, banana_pepper, raw_banana])

    assert ranked[0] is raw_banana
    assert ranked.index(banana_pepper) > ranked.index(raw_banana)
