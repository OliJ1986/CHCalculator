from typing import Protocol

from ..domain.foods import FoodCandidate


class FoodProviderError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        source: str | None = None,
        request_type: str | None = None,
        method: str | None = None,
        query: str | None = None,
        status_code: int | None = None,
        kind: str = "unknown",
        retryable: bool = False,
        elapsed_ms: float | None = None,
    ) -> None:
        super().__init__(message)
        self.source = source
        self.request_type = request_type
        self.method = method
        self.query = query
        self.status_code = status_code
        self.kind = kind
        self.retryable = retryable
        self.elapsed_ms = elapsed_ms


class FoodProvider(Protocol):
    async def search(self, query: str, limit: int = 20) -> list[FoodCandidate]:
        ...

    async def get_by_id(self, external_id: str) -> FoodCandidate | None:
        ...

    async def get_by_barcode(self, barcode: str) -> FoodCandidate | None:
        ...
