import logging
from typing import Any

import httpx

from ..domain.aliases import display_usda_name, resolve_alias, translate_search_query
from ..domain.foods import FoodCandidate
from ..domain.usda import map_usda_food
from .http import request_json

logger = logging.getLogger(__name__)


class USDAProvider:
    data_types = ("Foundation", "SR Legacy", "Survey (FNDDS)")

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.nal.usda.gov/fdc/v1",
        timeout: float = 8.0,
        transport: httpx.AsyncBaseTransport | None = None,
        max_retries: int = 2,
        retry_base_delay: float = 0.25,
    ) -> None:
        self.api_key = api_key.strip()
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.transport = transport
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay
        self._missing_key_logged = False

    @property
    def configured(self) -> bool:
        return bool(self.api_key)

    async def _get(
        self,
        path: str,
        params: list[tuple[str, str]],
        *,
        request_type: str,
        query: str,
        method: str = "GET",
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return await request_json(
            source="usda",
            request_type=request_type,
            method=method,
            query=query,
            url=f"{self.base_url}{path}",
            params=[("api_key", self.api_key), *params],
            json_body=json_body,
            headers={"Accept": "application/json", "User-Agent": "CHill/0.1"},
            timeout=self.timeout,
            transport=self.transport,
            max_retries=self.max_retries,
            retry_base_delay=self.retry_base_delay,
        )

    async def search(self, query: str, limit: int = 20) -> list[FoodCandidate]:
        if not self.configured:
            if not self._missing_key_logged:
                logger.warning("USDA keresés kihagyva: USDA_API_KEY nincs konfigurálva")
                self._missing_key_logged = True
            return []
        alias = resolve_alias(query)
        provider_query = alias.usda_query if alias else translate_search_query(query)
        page_size = min(max(limit, 1), 50)
        payload = await self._get(
            "/foods/search",
            [],
            request_type="search",
            query=query,
            method="POST",
            json_body={
                "query": provider_query,
                "pageSize": page_size,
                "dataType": list(self.data_types),
            },
        )
        foods = payload.get("foods", [])
        if not isinstance(foods, list):
            return []
        candidates: list[FoodCandidate] = []
        mapped_count = 0
        invalid_ch_count = 0
        detail_budget = min(3, limit)
        for food in foods:
            if not isinstance(food, dict):
                continue
            source_name = food.get("description") or food.get("lowercaseDescription") or ""
            candidate = map_usda_food(food, display_usda_name(source_name))
            if candidate is None:
                continue
            mapped_count += 1
            if candidate.available_carbs_100g is None and candidate.source_payload.get("total_carbohydrate_100g") is not None:
                if detail_budget > 0:
                    detail_budget -= 1
                    detailed = await self.get_by_id(candidate.source_id, alias=alias)
                    if detailed is not None:
                        candidate = detailed
            if candidate.available_carbs_100g is None:
                invalid_ch_count += 1
            candidates.append(candidate)
        logger.info(
            'USDA search query="%s" provider_query="%s" data_types=%s raw=%d mapped=%d invalid_ch=%d',
            query,
            provider_query,
            ",".join(self.data_types),
            len(foods),
            mapped_count,
            invalid_ch_count,
        )
        return candidates

    async def get_by_id(self, external_id: str, alias=None) -> FoodCandidate | None:
        if not self.configured:
            if not self._missing_key_logged:
                logger.warning("USDA lekérés kihagyva: USDA_API_KEY nincs konfigurálva")
                self._missing_key_logged = True
            return None
        payload = await self._get(
            f"/food/{external_id}", [], request_type="detail", query=external_id
        )
        if payload.get("fdcId") is None:
            return None
        source_name = payload.get("description") or payload.get("lowercaseDescription") or ""
        return map_usda_food(payload, display_usda_name(source_name))
