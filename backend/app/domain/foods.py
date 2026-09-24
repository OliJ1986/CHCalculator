import math
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any


CATEGORY_INGREDIENT = "ingredient"
CATEGORY_PROCESSED = "processed"
CATEGORY_PACKAGED = "packaged"
CATEGORY_OTHER = "other"

CATEGORY_LABELS = {
    CATEGORY_INGREDIENT: "Alapanyag",
    CATEGORY_PROCESSED: "Feldolgozott élelmiszer",
    CATEGORY_PACKAGED: "Csomagolt termék",
    CATEGORY_OTHER: "Egyéb",
}

_PROCESSED_TERMS = (
    "baby",
    "bébi",
    "infant",
    "formula",
    "dessert",
    "joghurt",
    "yogurt",
    "snack",
    "cereal",
    "müzli",
    "muesli",
    "spread",
    "soup",
    "sauce",
    "juice",
    "chips",
    "cookie",
    "biscuit",
    "cake",
    "bread",
    "pasta",
    "tészta",
)
_RAW_TERMS = ("raw", "nyers", "fresh", "friss", "whole", "egész")


@dataclass(frozen=True)
class FoodCandidate:
    source: str
    source_id: str
    name: str
    brand: str | None = None
    barcode: str | None = None
    available_carbs_100g: float | None = None
    serving_size_g: float | None = None
    image_url: str | None = None
    language: str | None = None
    country: str | None = None
    is_generic: bool = False
    is_verified: bool = False
    source_payload: dict[str, Any] = field(default_factory=dict)
    original_name: str | None = None
    category: str = CATEGORY_OTHER


def normalize_query(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value.casefold())
    without_accents = "".join(char for char in decomposed if not unicodedata.combining(char))
    return " ".join(without_accents.split())


def _valid_carbs(value: Any) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    numeric = float(value)
    if not math.isfinite(numeric) or not 0 <= numeric <= 100:
        return None
    return numeric


def _first_text(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _serving_size(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value) if value >= 0 and math.isfinite(float(value)) else None
    if isinstance(value, str):
        match = re.search(r"\d+(?:[.,]\d+)?", value)
        if match:
            number = float(match.group(0).replace(",", "."))
            return number if math.isfinite(number) else None
    return None


def _country(value: Any) -> str | None:
    if not isinstance(value, list):
        return None
    for item in value:
        if isinstance(item, str) and item.strip():
            return item.split(":", 1)[-1].replace("-", " ")
    return None


def category_label(category: str | None) -> str:
    return CATEGORY_LABELS.get(category or CATEGORY_OTHER, CATEGORY_LABELS[CATEGORY_OTHER])


def categorize_open_food_facts_product(product: dict[str, Any], *, name: str) -> str:
    """Classify OFF products conservatively from fields supplied by OFF."""
    categories = product.get("categories_tags")
    packaging = product.get("packaging_tags")
    category_values = (
        tuple(categories if isinstance(categories, list) else ())
        + tuple(packaging if isinstance(packaging, list) else ())
    )
    category_text = " ".join(str(value) for value in category_values)
    searchable = normalize_query(" ".join((name, category_text)))
    if any(normalize_query(term) in searchable for term in _PROCESSED_TERMS):
        return CATEGORY_PROCESSED
    if product.get("brands") or packaging or product.get("product_type"):
        return CATEGORY_PACKAGED
    if any(normalize_query(term) in searchable for term in _RAW_TERMS):
        return CATEGORY_INGREDIENT
    return CATEGORY_OTHER


def map_open_food_facts_product(product: dict[str, Any]) -> FoodCandidate | None:
    product_name_hu = _first_text(product.get("product_name_hu"))
    product_name = _first_text(product.get("product_name"))
    name = product_name_hu or product_name
    source_id = _first_text(product.get("code"))
    if not name or not source_id:
        return None

    brands = _first_text(product.get("brands"))
    nutriments = product.get("nutriments") if isinstance(product.get("nutriments"), dict) else {}
    raw_payload = {
        key: product.get(key)
        for key in (
            "code",
            "product_name",
            "product_name_hu",
            "brands",
            "nutriments",
            "serving_size",
            "image_front_small_url",
            "countries_tags",
            "lang",
            "lc",
            "categories_tags",
            "packaging_tags",
            "product_type",
        )
        if product.get(key) is not None
    }
    language = _first_text(product.get("lang")) or _first_text(product.get("lc"))
    if not language and product_name_hu:
        language = "hu"
    return FoodCandidate(
        source="open_food_facts",
        source_id=source_id,
        name=name,
        original_name=product_name or name,
        brand=brands.split(",", 1)[0].strip() if brands else None,
        barcode=source_id,
        available_carbs_100g=_valid_carbs(nutriments.get("carbohydrates_100g")),
        serving_size_g=_serving_size(product.get("serving_size")),
        image_url=_first_text(product.get("image_front_small_url")),
        language=language,
        country=_country(product.get("countries_tags")),
        is_generic=False,
        is_verified=False,
        category=categorize_open_food_facts_product(product, name=name),
        source_payload=raw_payload,
    )
