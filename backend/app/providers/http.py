import asyncio
import logging
from time import perf_counter
from typing import Any

import httpx

from .base import FoodProviderError

logger = logging.getLogger(__name__)
# httpx/httpcore INFO logs include full request URLs. USDA requests carry the
# API key in the query string, so third-party request logging stays disabled.
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("httpcore").setLevel(logging.WARNING)


def _status_failure(status_code: int) -> tuple[str, str, bool]:
    if status_code in {401, 403}:
        return "authentication", "authentication_error", False
    if status_code == 429:
        return "rate_limit", "rate_limit", True
    if 400 <= status_code < 500:
        return "bad_request", "bad_request", False
    if status_code >= 500:
        return "service_unavailable", "service_unavailable", True
    return "http_error", "http_error", False


def _log_failure(
    *,
    source: str,
    request_type: str,
    method: str,
    query: str,
    status_code: int | None,
    error: str,
    elapsed_ms: float,
    attempt: int,
    retry: bool,
) -> None:
    logger.warning(
        "provider_request_failed source=%s request_type=%s method=%s query=%r status=%s "
        "error=%s response_time_ms=%.1f attempt=%d retry=%s",
        source,
        request_type,
        method,
        query,
        status_code if status_code is not None else "none",
        error,
        elapsed_ms,
        attempt,
        retry,
    )


async def request_json(
    *,
    source: str,
    request_type: str,
    method: str = "GET",
    query: str,
    url: str,
    params: list[tuple[str, str]] | dict[str, Any] | None,
    json_body: Any = None,
    headers: dict[str, str],
    timeout: float,
    transport: httpx.AsyncBaseTransport | None,
    max_retries: int = 2,
    retry_base_delay: float = 0.25,
) -> dict[str, Any]:
    """Request provider JSON with bounded retries and secret-free diagnostics."""
    retries = max(0, max_retries)
    async with httpx.AsyncClient(timeout=timeout, headers=headers, transport=transport) as client:
        for attempt in range(retries + 1):
            started = perf_counter()
            status_code: int | None = None
            try:
                response = await client.request(method, url, params=params, json=json_body)
                status_code = response.status_code
                elapsed_ms = (perf_counter() - started) * 1000
                if status_code >= 400:
                    kind, error, retryable = _status_failure(status_code)
                    retry = retryable and attempt < retries
                    _log_failure(
                        source=source,
                        request_type=request_type,
                        method=method,
                        query=query,
                        status_code=status_code,
                        error=error,
                        elapsed_ms=elapsed_ms,
                        attempt=attempt + 1,
                        retry=retry,
                    )
                    if retry:
                        await asyncio.sleep(min(retry_base_delay * (2**attempt), 2.0))
                        continue
                    raise FoodProviderError(
                        f"{source} provider {error}",
                        source=source,
                        request_type=request_type,
                        method=method,
                        query=query,
                        status_code=status_code,
                        kind=kind,
                        retryable=retryable,
                        elapsed_ms=elapsed_ms,
                    )
                try:
                    payload = response.json()
                except ValueError as exc:
                    elapsed_ms = (perf_counter() - started) * 1000
                    retry = attempt < retries
                    _log_failure(
                        source=source,
                        request_type=request_type,
                        method=method,
                        query=query,
                        status_code=status_code,
                        error="invalid_response",
                        elapsed_ms=elapsed_ms,
                        attempt=attempt + 1,
                        retry=retry,
                    )
                    if retry:
                        await asyncio.sleep(min(retry_base_delay * (2**attempt), 2.0))
                        continue
                    raise FoodProviderError(
                        f"{source} provider invalid response",
                        source=source,
                        request_type=request_type,
                        method=method,
                        query=query,
                        status_code=status_code,
                        kind="invalid_response",
                        retryable=True,
                        elapsed_ms=elapsed_ms,
                    ) from exc
                if not isinstance(payload, dict):
                    elapsed_ms = (perf_counter() - started) * 1000
                    retry = attempt < retries
                    _log_failure(
                        source=source,
                        request_type=request_type,
                        method=method,
                        query=query,
                        status_code=status_code,
                        error="invalid_response",
                        elapsed_ms=elapsed_ms,
                        attempt=attempt + 1,
                        retry=retry,
                    )
                    if retry:
                        await asyncio.sleep(min(retry_base_delay * (2**attempt), 2.0))
                        continue
                    raise FoodProviderError(
                        f"{source} provider invalid response",
                        source=source,
                        request_type=request_type,
                        method=method,
                        query=query,
                        status_code=status_code,
                        kind="invalid_response",
                        retryable=True,
                        elapsed_ms=elapsed_ms,
                    )
                return payload
            except FoodProviderError:
                raise
            except httpx.TimeoutException as exc:
                elapsed_ms = (perf_counter() - started) * 1000
                retry = attempt < retries
                _log_failure(
                    source=source,
                    request_type=request_type,
                    method=method,
                    query=query,
                    status_code=status_code,
                    error="timeout",
                    elapsed_ms=elapsed_ms,
                    attempt=attempt + 1,
                    retry=retry,
                )
                if retry:
                    await asyncio.sleep(min(retry_base_delay * (2**attempt), 2.0))
                    continue
                raise FoodProviderError(
                    f"{source} provider timeout",
                    source=source,
                    request_type=request_type,
                    method=method,
                    query=query,
                    kind="timeout",
                    retryable=True,
                    elapsed_ms=elapsed_ms,
                ) from exc
            except httpx.RequestError as exc:
                elapsed_ms = (perf_counter() - started) * 1000
                retry = attempt < retries
                _log_failure(
                    source=source,
                    request_type=request_type,
                    method=method,
                    query=query,
                    status_code=status_code,
                    error="network_error",
                    elapsed_ms=elapsed_ms,
                    attempt=attempt + 1,
                    retry=retry,
                )
                if retry:
                    await asyncio.sleep(min(retry_base_delay * (2**attempt), 2.0))
                    continue
                raise FoodProviderError(
                    f"{source} provider network error",
                    source=source,
                    request_type=request_type,
                    method=method,
                    query=query,
                    kind="network_error",
                    retryable=True,
                    elapsed_ms=elapsed_ms,
                ) from exc
    raise AssertionError("provider request loop unexpectedly ended")
