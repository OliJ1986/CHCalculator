import asyncio
import logging
from collections.abc import Sequence

from sqlalchemy import and_, select
from sqlalchemy.orm import Session

from ..domain.aliases import translate_search_query
from ..domain.foods import FoodCandidate, normalize_query
from ..models import Food
from ..providers.base import FoodProvider, FoodProviderError
from .ranking import detect_search_intent, rank_foods

logger = logging.getLogger(__name__)


def _search_text(candidate: FoodCandidate) -> str:
    return normalize_query(
        " ".join(
            part
            for part in (candidate.name, candidate.original_name or "", candidate.brand or "")
            if part
        )
    )


def _to_food(candidate: FoodCandidate) -> Food:
    return Food(
        name=candidate.name,
        original_name=candidate.original_name,
        normalized_name=_search_text(candidate),
        brand=candidate.brand,
        barcode=candidate.barcode,
        source=candidate.source,
        source_id=candidate.source_id,
        available_carbs_100g=candidate.available_carbs_100g,
        serving_size_g=candidate.serving_size_g,
        image_url=candidate.image_url,
        language=candidate.language,
        country=candidate.country,
        is_generic=candidate.is_generic,
        is_verified=candidate.is_verified,
        category=candidate.category,
        source_payload=candidate.source_payload,
    )


class FoodService:
    def __init__(self, provider: FoodProvider, *additional_providers: FoodProvider) -> None:
        self.provider = provider
        self.providers = (provider, *additional_providers)

    @staticmethod
    def _local_search(db: Session, normalized: str, limit: int) -> list[Food]:
        tokens = tuple(dict.fromkeys(normalized.split()))
        if not tokens:
            return []
        statement = (
            select(Food)
            .where(and_(*(Food.normalized_name.contains(token) for token in tokens)))
            .order_by(Food.name.asc())
            .limit(limit)
        )
        return list(db.scalars(statement))

    @staticmethod
    def _find_existing(db: Session, candidate: FoodCandidate) -> Food | None:
        statement = select(Food).where(
            Food.source == candidate.source,
            Food.source_id == candidate.source_id,
        )
        return db.scalar(statement)

    @staticmethod
    def _upsert(db: Session, candidates: Sequence[FoodCandidate]) -> list[Food]:
        foods: list[Food] = []
        seen: set[tuple[str, str]] = set()
        for candidate in candidates:
            key = (candidate.source, candidate.source_id)
            if key in seen:
                continue
            seen.add(key)
            food = FoodService._find_existing(db, candidate)
            if food is None:
                food = _to_food(candidate)
                db.add(food)
            else:
                food.name = candidate.name
                food.original_name = candidate.original_name
                food.normalized_name = _search_text(candidate)
                food.brand = candidate.brand
                food.barcode = candidate.barcode
                food.available_carbs_100g = candidate.available_carbs_100g
                food.serving_size_g = candidate.serving_size_g
                food.image_url = candidate.image_url
                food.language = candidate.language
                food.country = candidate.country
                food.is_generic = candidate.is_generic
                food.is_verified = candidate.is_verified
                food.category = candidate.category
                food.source_payload = candidate.source_payload
            foods.append(food)
        db.commit()
        for food in foods:
            db.refresh(food)
        return foods

    async def search(self, db: Session, query: str, limit: int = 20) -> list[Food]:
        normalized = normalize_query(query)
        intent = detect_search_intent(query)
        aliases = intent.alias
        local_by_key: dict[tuple[str, str], Food] = {}
        for local_query in tuple(
            dict.fromkeys(
                (
                    normalized,
                    translate_search_query(query),
                    normalize_query(aliases.usda_query) if aliases else "",
                )
            )
        ):
            if local_query:
                local_by_key.update(
                    {
                        (food.source, food.source_id): food
                        for food in self._local_search(db, local_query, limit)
                    }
                )
        local = list(local_by_key.values())
        results = await asyncio.gather(
            *(provider.search(query.strip(), limit) for provider in self.providers),
            return_exceptions=True,
        )
        candidates: list[FoodCandidate] = []
        provider_errors: list[BaseException] = []
        provider_counts: dict[str, int] = {}
        for result in results:
            if isinstance(result, BaseException):
                provider_errors.append(result)
                if isinstance(result, FoodProviderError):
                    logger.warning(
                        "food_provider_failed source=%s request_type=%s query=%r status=%s kind=%s",
                        result.source or "unknown",
                        result.request_type or "unknown",
                        result.query or query,
                        result.status_code if result.status_code is not None else "none",
                        result.kind,
                    )
                else:
                    # Keep unexpected exception text out of logs: transport
                    # exceptions can contain URLs or query parameters.
                    logger.warning(
                        "food_provider_failed source=unknown error_type=%s",
                        type(result).__name__,
                    )
            else:
                candidates.extend(result)
                for candidate in result:
                    provider_counts[candidate.source] = provider_counts.get(candidate.source, 0) + 1

        cached = self._upsert(db, candidates)
        merged: dict[tuple[str, str], Food] = {
            (food.source, food.source_id): food for food in local
        }
        def matches(food: Food) -> bool:
            searchable = normalize_query(
                " ".join(
                    part
                    for part in (food.name, getattr(food, "original_name", None), food.brand)
                    if part
                )
            )
            return bool(intent.token_variants) and all(
                any(variant in searchable for variant in variants)
                for variants in intent.token_variants
            )

        merged.update({
            (food.source, food.source_id): food
            for food in cached
            if matches(food)
            or (intent.simple_ingredient and aliases is not None and food.is_generic)
        })
        ranked = rank_foods(query, list(merged.values()))[:limit]
        logger.info(
            'food search query="%s" cache=%d fresh_usda=%d fresh_off=%d deduped=%d ranked=%d',
            query,
            len(local),
            provider_counts.get("usda", 0),
            provider_counts.get("open_food_facts", 0),
            len(merged),
            len(ranked),
        )
        if not ranked and provider_errors and not local:
            raise next(
                (error for error in provider_errors if isinstance(error, FoodProviderError)),
                provider_errors[0],
            )
        return ranked

    async def get_by_barcode(self, db: Session, barcode: str) -> Food | None:
        normalized_barcode = barcode.strip()
        local = db.scalar(select(Food).where(Food.barcode == normalized_barcode))
        if local is not None:
            return local
        candidate = await self.provider.get_by_barcode(normalized_barcode)
        if candidate is None:
            return None
        return self._upsert(db, [candidate])[0]
