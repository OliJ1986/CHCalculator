import math
from typing import Any

from .foods import (
    CATEGORY_INGREDIENT,
    CATEGORY_OTHER,
    CATEGORY_PACKAGED,
    CATEGORY_PROCESSED,
    FoodCandidate,
    normalize_query,
)

TOTAL_CARBOHYDRATE_NUTRIENT_ID = 1005
DIETARY_FIBER_NUTRIENT_ID = 1079
USDA_MAPPING_VERSION = 4
GENERIC_DATA_TYPES = {"Foundation", "SR Legacy", "Survey (FNDDS)"}

_INGREDIENT_GROUPS = (
    "fruits and fruit juices",
    "vegetables and vegetable products",
    "poultry products",
    "beef products",
    "pork products",
    "dairy and egg products",
    "cereal grains and pasta",
    "legumes and legume products",
)


def categorize_usda_food(food: dict[str, Any], name: str) -> str:
    data_type = food.get("dataType") if isinstance(food.get("dataType"), str) else ""
    raw_food_category = food.get("foodCategory")
    if isinstance(raw_food_category, str):
        food_category = raw_food_category
    elif isinstance(raw_food_category, dict):
        food_category = str(raw_food_category.get("description") or "")
    else:
        food_category = ""
    name_searchable = normalize_query(name)
    category_searchable = normalize_query(food_category)
    if data_type == "Branded":
        return CATEGORY_PACKAGED
    if any(
        term in name_searchable
        for term in (
            "baby food",
            "babyfood",
            "infant",
            "formula",
            "joghurt",
            "yogurt",
            "dessert",
            "cereal bar",
            "snack",
            "chips",
            "juice",
            "nectar",
            "pudding",
            "cake",
            "pie",
            "split",
            "dehydrated",
            "powder",
            "bread",
            "pasta",
            "baked",
            "canned",
            "dried",
            "cooked",
            "boiled",
            "prepared",
        )
    ):
        return CATEGORY_PROCESSED
    if any(
        term in category_searchable
        for term in ("baby food", "babyfood", "dried fruit", "fruit drink", "snacks", "pudding", "cakes and pies")
    ):
        return CATEGORY_PROCESSED
    if any(term in name_searchable for term in ("raw", "fresh", "whole", "unprocessed")):
        return CATEGORY_INGREDIENT
    if category_searchable in {normalize_query(group) for group in _INGREDIENT_GROUPS}:
        return CATEGORY_INGREDIENT
    # Generic records without a clear raw/ingredient signal remain conservative.
    return CATEGORY_OTHER


def _numeric(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    numeric = float(value)
    return numeric if math.isfinite(numeric) and numeric >= 0 else None


def nutrient_value(food: dict[str, Any], nutrient_id: int) -> float | None:
    nutrients = food.get("foodNutrients")
    if not isinstance(nutrients, list):
        return None
    for nutrient in nutrients:
        if not isinstance(nutrient, dict):
            continue
        nested = nutrient.get("nutrient") if isinstance(nutrient.get("nutrient"), dict) else {}
        raw_id = nutrient.get("nutrientId", nested.get("id"))
        try:
            matches = int(raw_id) == nutrient_id
        except (TypeError, ValueError):
            matches = False
        if matches:
            return _numeric(nutrient.get("value", nutrient.get("amount")))
    return None


def map_usda_food(food: dict[str, Any], display_name: str | None = None) -> FoodCandidate | None:
    raw_id = food.get("fdcId")
    source_name = food.get("description") or food.get("lowercaseDescription")
    name = display_name or source_name
    if raw_id is None or not isinstance(name, str) or not name.strip() or not isinstance(source_name, str):
        return None
    source_id = str(raw_id)
    data_type = food.get("dataType") if isinstance(food.get("dataType"), str) else ""
    total = nutrient_value(food, TOTAL_CARBOHYDRATE_NUTRIENT_ID)
    fiber = nutrient_value(food, DIETARY_FIBER_NUTRIENT_ID)
    valid_total = total is not None and total <= 100
    valid_fiber = fiber is not None and fiber <= 100
    available = None if not valid_total or not valid_fiber or fiber > total else total - fiber
    if available is not None and not 0 <= available <= 100:
        available = None
    raw_payload = {
        "fdc_id": source_id,
        "mapping_version": USDA_MAPPING_VERSION,
        "description": food.get("description"),
        "data_type": data_type,
        "food_category": food.get("foodCategory"),
        "nutrient_ids": {
            "total_carbohydrate": TOTAL_CARBOHYDRATE_NUTRIENT_ID,
            "dietary_fiber": DIETARY_FIBER_NUTRIENT_ID,
        },
        "nutrient_values": {
            str(TOTAL_CARBOHYDRATE_NUTRIENT_ID): total,
            str(DIETARY_FIBER_NUTRIENT_ID): fiber,
        },
        "total_carbohydrate_100g": total,
        "dietary_fiber_100g": fiber,
        "available_carbs_100g": available,
    }
    return FoodCandidate(
        source="usda",
        source_id=source_id,
        name=name.strip(),
        original_name=source_name.strip(),
        available_carbs_100g=available,
        serving_size_g=None,
        language="en",
        country="US",
        is_generic=data_type in GENERIC_DATA_TYPES,
        is_verified=False,
        category=categorize_usda_food(food, source_name),
        source_payload=raw_payload,
    )
