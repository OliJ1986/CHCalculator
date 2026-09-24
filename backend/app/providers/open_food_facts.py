from typing import Any

import httpx

from ..domain.foods import FoodCandidate, map_open_food_facts_product, normalize_query
from .http import request_json



class OpenFoodFactsProvider:
    base_url = "https://world.openfoodfacts.org"
    user_agent = "CHill/0.1 (contact: support@chill.app)"
    fields = ",".join(
        (
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
    )

    def __init__(
        self,
        timeout: float = 8.0,
        transport: httpx.AsyncBaseTransport | None = None,
        max_retries: int = 3,
        retry_base_delay: float = 0.5,
    ) -> None:
        self.timeout = timeout
        self.transport = transport
        self.max_retries = max_retries
        self.retry_base_delay = retry_base_delay

    async def _get(
        self,
        url: str,
        params: dict[str, Any] | None = None,
        *,
        request_type: str,
        query: str,
    ) -> dict[str, Any]:
        return await request_json(
            source="open_food_facts",
            request_type=request_type,
            query=query,
            url=url,
            params=params,
            headers={"User-Agent": self.user_agent, "Accept": "application/json"},
            timeout=self.timeout,
            transport=self.transport,
            max_retries=self.max_retries,
            retry_base_delay=self.retry_base_delay,
        )

    @staticmethod
    def _candidate(product: Any) -> FoodCandidate | None:
        return map_open_food_facts_product(product) if isinstance(product, dict) else None

    async def search(self, query: str, limit: int = 20) -> list[FoodCandidate]:
        # OFF v2/v3 has no general full-text search; the documented legacy search
        # endpoint is used only for this query use case until Search-a-licious is available.
        provider_query = normalize_query(query)
        payload = await self._get(
            f"{self.base_url}/cgi/search.pl",
            params={
                "search_terms": provider_query,
                "search_simple": "1",
                "action": "process",
                "json": "1",
                "page": "1",
                "page_size": str(min(max(limit, 1), 50)),
                "fields": self.fields,
            },
            request_type="search",
            query=provider_query,
        )
        products = payload.get("products", [])
        if not isinstance(products, list):
            return []
        return [candidate for product in products if (candidate := self._candidate(product)) is not None]

    async def get_by_id(self, external_id: str) -> FoodCandidate | None:
        return await self.get_by_barcode(external_id)

    async def get_by_barcode(self, barcode: str) -> FoodCandidate | None:
        payload = await self._get(
            f"{self.base_url}/api/v3/product/{barcode}",
            params={"fields": self.fields},
            request_type="barcode",
            query=barcode,
        )
        if payload.get("status") == 0:
            return None
        return self._candidate(payload.get("product", payload))
