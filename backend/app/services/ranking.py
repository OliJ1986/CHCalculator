from dataclasses import dataclass
import re
from collections.abc import Sequence

from ..domain.aliases import QueryAlias, resolve_alias, translate_search_query
from ..domain.foods import (
    CATEGORY_INGREDIENT,
    CATEGORY_OTHER,
    CATEGORY_PACKAGED,
    CATEGORY_PROCESSED,
    normalize_query,
)
from ..models import Food


# Scores are deliberately plain constants so ranking changes remain reviewable.
EXACT_NAME_SCORE = 1000
CURATED_ALIAS_NAME_SCORE = 900
ALL_COMPOUND_TOKENS_SCORE = 420
ALL_SIMPLE_TOKENS_SCORE = 140
PARTIAL_TOKEN_SCORE = 35
NAME_CONTAINS_SCORE = 110
BRAND_CONTAINS_SCORE = 190
BRAND_ALL_TOKENS_SCORE = 100
SIMPLE_INGREDIENT_SCORE = 600
SIMPLE_PROCESSED_SCORE = 80
GENERIC_INGREDIENT_SCORE = 40
MISSING_CARBS_PENALTY = 100


@dataclass(frozen=True)
class SearchIntent:
    normalized_query: str
    tokens: tuple[str, ...]
    token_variants: tuple[tuple[str, ...], ...]
    alias: QueryAlias | None
    simple_ingredient: bool


def _tokens(value: str) -> tuple[str, ...]:
    return tuple(dict.fromkeys(re.findall(r"[\w]+", normalize_query(value), flags=re.UNICODE)))


def _source_starts_with_token(source: str, token: str) -> bool:
    if not source.startswith(token):
        return False
    remainder = source[len(token) :]
    if not remainder:
        return True
    if remainder.startswith("s"):
        remainder = remainder[1:]
        if not remainder:
            return True
    return remainder[0] in " ,;:/-("


def detect_search_intent(query: str) -> SearchIntent:
    normalized = normalize_query(query)
    tokens = _tokens(normalized)
    alias = resolve_alias(normalized)
    translated_tokens = _tokens(translate_search_query(normalized))
    token_variants = tuple(
        tuple(dict.fromkeys((token, translated_tokens[index])))
        for index, token in enumerate(tokens)
        if index < len(translated_tokens)
    )
    return SearchIntent(
        normalized_query=normalized,
        tokens=tokens,
        token_variants=token_variants,
        alias=alias,
        simple_ingredient=alias is not None and len(tokens) == 1,
    )


def _score(query: str, food: Food) -> int:
    intent = detect_search_intent(query)
    name = normalize_query(food.name)
    original_name = normalize_query(getattr(food, "original_name", None) or "")
    brand = normalize_query(food.brand or "")
    searchable = " ".join(part for part in (name, original_name, brand) if part)
    food_category = getattr(food, "category", None) or CATEGORY_OTHER
    score = 0

    if name == intent.normalized_query or original_name == intent.normalized_query:
        score += EXACT_NAME_SCORE
    if intent.alias and name == normalize_query(intent.alias.display_name):
        score += CURATED_ALIAS_NAME_SCORE

    matching_tokens = sum(
        any(variant in searchable for variant in variants)
        for variants in intent.token_variants
    )
    if intent.tokens and matching_tokens == len(intent.tokens):
        score += ALL_COMPOUND_TOKENS_SCORE if len(intent.tokens) > 1 else ALL_SIMPLE_TOKENS_SCORE
    elif matching_tokens:
        score += PARTIAL_TOKEN_SCORE * matching_tokens

    if intent.normalized_query and intent.normalized_query in name:
        score += NAME_CONTAINS_SCORE
    if intent.normalized_query and intent.normalized_query in brand:
        score += BRAND_CONTAINS_SCORE
    if brand and intent.token_variants and all(
        any(variant in brand for variant in variants) for variants in intent.token_variants
    ):
        score += BRAND_ALL_TOKENS_SCORE

    if intent.simple_ingredient and intent.alias:
        alias_token = normalize_query(intent.alias.display_name).split()[0]
        source_token = normalize_query(intent.alias.usda_query).split()[0]
        primary_texts = (original_name,) if original_name else (name,)
        # Older cached/test rows may not have a category yet; only those rows
        # use the legacy generic flag as a fallback ingredient signal.
        ingredient_like = food_category == CATEGORY_INGREDIENT or (
            food_category == CATEGORY_OTHER and food.is_generic
        )
        has_alias = any(
            not (intent.alias.key == "banan" and "pepper" in text)
            and any(_source_starts_with_token(text, token) for token in (alias_token, source_token))
            for text in primary_texts
        )
        if has_alias:
            if ingredient_like:
                score += SIMPLE_INGREDIENT_SCORE
            elif food_category in {CATEGORY_PROCESSED, CATEGORY_PACKAGED}:
                score += SIMPLE_PROCESSED_SCORE
        if ingredient_like:
            score += GENERIC_INGREDIENT_SCORE

    if food.available_carbs_100g is None:
        score -= MISSING_CARBS_PENALTY
    return score


def rank_foods(query: str, foods: Sequence[Food]) -> list[Food]:
    """Return a stable, explainable relevance order for one user query."""
    return sorted(
        foods,
        key=lambda food: (
            -_score(query, food),
            -int(food.available_carbs_100g is not None),
            normalize_query(food.name),
            normalize_query(getattr(food, "original_name", None) or ""),
            normalize_query(food.brand or ""),
            food.source,
            food.source_id,
        ),
    )
