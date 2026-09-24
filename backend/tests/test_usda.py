import asyncio
import json

import httpx
import pytest

from app.domain.aliases import alias_display_name, display_usda_name, resolve_alias
from app.domain.usda import USDA_MAPPING_VERSION, map_usda_food
from app.providers.usda import USDAProvider


def usda_food(
    *,
    description: str = "Apples, raw, with skin",
    data_type: str = "Foundation",
    total: object = 13.8,
    fiber: object = 2.4,
) -> dict:
    nutrients = []
    if total is not None:
        nutrients.append({"nutrientId": 1005, "value": total})
    if fiber is not None:
        nutrients.append({"nutrientId": 1079, "value": fiber})
    return {"fdcId": 9001, "description": description, "dataType": data_type, "foodNutrients": nutrients}


def test_usda_mapping_subtracts_fiber_from_total_carbohydrate() -> None:
    candidate = map_usda_food(usda_food())

    assert candidate is not None
    assert candidate.available_carbs_100g == 11.4
    assert candidate.is_generic is True
    assert candidate.source_payload["total_carbohydrate_100g"] == 13.8
    assert candidate.source_payload["dietary_fiber_100g"] == 2.4
    assert candidate.source_payload["nutrient_ids"] == {
        "total_carbohydrate": 1005,
        "dietary_fiber": 1079,
    }
    assert candidate.source_payload["mapping_version"] == USDA_MAPPING_VERSION


def test_usda_mapping_accepts_zero_fiber() -> None:
    candidate = map_usda_food(usda_food(total=12, fiber=0))

    assert candidate is not None
    assert candidate.available_carbs_100g == 12


def test_usda_mapping_requires_both_carbohydrate_and_fiber() -> None:
    for product in (usda_food(total=None), usda_food(fiber=None), usda_food(total=-1), usda_food(total=101)):
        candidate = map_usda_food(product)
        assert candidate is not None
        assert candidate.available_carbs_100g is None


def test_usda_mapping_rejects_inconsistent_fiber_without_estimating() -> None:
    candidate = map_usda_food(usda_food(total=10, fiber=12))

    assert candidate is not None
    assert candidate.available_carbs_100g is None


def test_usda_mapping_is_consistent_across_generic_data_types() -> None:
    for data_type in ("Foundation", "SR Legacy", "Survey (FNDDS)"):
        candidate = map_usda_food(usda_food(data_type=data_type))

        assert candidate is not None
        assert candidate.available_carbs_100g == 11.4
        assert candidate.source_payload["data_type"] == data_type


def test_usda_mapping_marks_branded_food_as_non_generic() -> None:
    candidate = map_usda_food(usda_food(data_type="Branded"))

    assert candidate is not None
    assert candidate.is_generic is False


def test_aliases_are_accent_and_case_insensitive() -> None:
    assert resolve_alias("  BÚRGONYA ").usda_query == "potato"
    assert resolve_alias("krumpli").display_name == "Burgonya"


def test_usda_names_keep_food_distinctions() -> None:
    banana_alias = resolve_alias("banán")

    assert banana_alias is not None
    assert alias_display_name(banana_alias, "Pepper, banana, raw") == "Pepper, banana, raw"
    assert alias_display_name(banana_alias, "Banana peppers, raw") == "Paprika, banánpaprika, nyers"
    assert alias_display_name(banana_alias, "Bananas, overripe, raw") == "Banán, túlérett, nyers"
    assert display_usda_name("Pepper, banana, raw") == "Paprika, banánpaprika, nyers"


def test_usda_provider_uses_search_and_detail_endpoints() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path.endswith("/foods/search"):
            return httpx.Response(200, json={"foods": [usda_food(fiber=None)]})
        return httpx.Response(200, json={"fdcId": 9001, "description": "Apples, raw, with skin", "dataType": "Foundation", "foodNutrients": [{"nutrientId": 1005, "value": 13.8}, {"nutrientId": 1079, "value": 2.4}]})

    provider = USDAProvider("test-key", transport=httpx.MockTransport(handler))
    candidates = asyncio.run(provider.search("alma", limit=1))

    assert requests[0].url.path.endswith("/foods/search")
    assert requests[0].method == "POST"
    body = json.loads(requests[0].content)
    assert body["dataType"] == ["Foundation", "SR Legacy", "Survey (FNDDS)"]
    assert body["query"] == "apple"
    assert requests[1].url.path.endswith("/food/9001")
    assert candidates[0].name == "Alma, nyers, héjjal"
    assert candidates[0].available_carbs_100g == 11.4


def test_usda_provider_uses_source_name_for_banana_pepper_label() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "foods": [
                    usda_food(
                        description="Pepper, banana, raw",
                        data_type="SR Legacy",
                        total=5.35,
                        fiber=3.4,
                    )
                ]
            },
        )

    provider = USDAProvider("test-key", transport=httpx.MockTransport(handler))
    candidates = asyncio.run(provider.search("banán", limit=1))

    assert candidates[0].name == "Paprika, banánpaprika, nyers"
    assert candidates[0].original_name == "Pepper, banana, raw"
    assert candidates[0].available_carbs_100g == pytest.approx(1.95)


def test_rizs_alias_is_sent_to_usda_as_rice() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"foods": []})

    provider = USDAProvider("test-key", transport=httpx.MockTransport(handler))
    assert asyncio.run(provider.search("rizs", limit=5)) == []

    assert requests[0].url.path.endswith("/foods/search")
    assert json.loads(requests[0].content)["query"] == "rice"


def test_compound_hungarian_query_uses_curated_provider_terms() -> None:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"foods": []})

    provider = USDAProvider("test-key", transport=httpx.MockTransport(handler))
    assert asyncio.run(provider.search("banános joghurt", limit=5)) == []

    assert json.loads(requests[0].content)["query"] == "banana yogurt"


def test_unconfigured_usda_provider_is_gracefully_unavailable() -> None:
    provider = USDAProvider("")

    assert asyncio.run(provider.search("alma")) == []
