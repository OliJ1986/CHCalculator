from app.domain.aliases import resolve_alias
from app.domain.foods import (
    CATEGORY_INGREDIENT,
    CATEGORY_PACKAGED,
    CATEGORY_PROCESSED,
    map_open_food_facts_product,
)
from app.domain.usda import USDA_MAPPING_VERSION, map_usda_food
from app.db import migrate_usda_cache
from app.models import Base, Food
from app.services.ranking import detect_search_intent, rank_foods
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool


def test_hungarian_aliases_are_normalized_and_have_curated_names() -> None:
    for query in (
        "banán",
        "alma",
        "körte",
        "narancs",
        "citrom",
        "burgonya",
        "rizs",
        "tészta",
        "csirkemell",
        "sertéshús",
        "marhahús",
        "tojás",
        "tej",
        "sajt",
        "vaj",
        "kenyér",
        "zabpehely",
        "cukor",
        "liszt",
        "paradicsom",
        "paprika",
        "uborka",
        "sárgarépa",
    ):
        assert resolve_alias(query) is not None

    assert resolve_alias("  BAnÁn ").display_name == "Banán"


def test_usda_keeps_source_name_and_classifies_generic_food() -> None:
    candidate = map_usda_food(
        {
            "fdcId": 1,
            "description": "Bananas, raw",
            "dataType": "Foundation",
            "foodCategory": "Fruits and Fruit Juices",
            "foodNutrients": [
                {"nutrientId": 1005, "value": 22.8},
                {"nutrientId": 1079, "value": 2.6},
            ],
        },
        display_name="Banán, nyers",
    )

    assert candidate is not None
    assert candidate.name == "Banán, nyers"
    assert candidate.original_name == "Bananas, raw"
    assert candidate.category == CATEGORY_INGREDIENT
    assert candidate.available_carbs_100g == 20.2


def test_usda_and_off_categories_are_conservative() -> None:
    branded = map_usda_food(
        {
            "fdcId": 2,
            "description": "Banana yogurt",
            "dataType": "Branded",
            "foodNutrients": [
                {"nutrientId": 1005, "value": 15},
                {"nutrientId": 1079, "value": 0.5},
            ],
        }
    )
    off = map_open_food_facts_product(
        {
            "code": "2",
            "product_name": "Banana yogurt",
            "brands": "Minta",
            "categories_tags": ["en:yogurts"],
            "nutriments": {"carbohydrates_100g": 15},
        }
    )

    assert branded is not None and branded.category == CATEGORY_PACKAGED
    assert off is not None and off.category == CATEGORY_PROCESSED


def test_simple_and_compound_intents_rank_deterministically() -> None:
    raw_banana = Food(
        source="usda",
        source_id="1",
        name="Banán, nyers",
        original_name="Bananas, raw",
        normalized_name="banan nyers bananas raw",
        available_carbs_100g=20.2,
        is_generic=True,
        category=CATEGORY_INGREDIENT,
    )
    baby_food = Food(
        source="usda",
        source_id="2",
        name="Banános bébiétel",
        original_name="Baby food, banana",
        normalized_name="bananos bebietel baby food banana",
        available_carbs_100g=12,
        is_generic=True,
        category=CATEGORY_PROCESSED,
    )
    yogurt = Food(
        source="open_food_facts",
        source_id="3",
        name="Activia banános joghurt",
        original_name="Activia banana yogurt",
        normalized_name="activia bananos joghurt activia banana yogurt",
        brand="Activia",
        available_carbs_100g=13,
        category=CATEGORY_PROCESSED,
    )

    assert detect_search_intent("banán").simple_ingredient is True
    assert rank_foods("banán", [baby_food, raw_banana])[0] is raw_banana
    assert detect_search_intent("Activia banán").simple_ingredient is False
    assert rank_foods("Activia banán", [raw_banana, yogurt])[0] is yogurt

    translated_product = Food(
        source="usda",
        source_id="4",
        name="Banana yogurt",
        original_name="Banana yogurt",
        normalized_name="banana yogurt",
        available_carbs_100g=13,
        category=CATEGORY_PROCESSED,
    )
    assert rank_foods("banános joghurt", [raw_banana, translated_product])[0] is translated_product


def test_usda_cache_migration_updates_metadata_without_deleting_rows() -> None:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    with Session(engine) as db:
        stale = Food(
            name="Banán, nyers",
            original_name="Pepper, banana, raw",
            normalized_name="banan nyers pepper banana raw",
            source="usda",
            source_id="169394",
            available_carbs_100g=1.95,
            source_payload={
                "description": "Pepper, banana, raw",
                "data_type": "SR Legacy",
                "food_category": "Vegetables and Vegetable Products",
                "total_carbohydrate_100g": 5.35,
                "dietary_fiber_100g": 3.4,
            },
        )
        db.add(stale)
        db.commit()

        changed = migrate_usda_cache(db)
        db.refresh(stale)

        assert changed == 1
        assert stale.source_id == "169394"
        assert stale.name == "Paprika, banánpaprika, nyers"
        assert stale.available_carbs_100g == 1.95
        assert stale.source_payload["mapping_version"] == USDA_MAPPING_VERSION
        assert stale.source_payload["nutrient_values"]["1005"] == 5.35
