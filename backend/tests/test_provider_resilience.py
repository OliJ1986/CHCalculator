import asyncio
import logging

import httpx
import pytest

from app.providers.base import FoodProviderError
from app.providers.open_food_facts import OpenFoodFactsProvider
from app.providers.usda import USDAProvider


def test_usda_bad_request_is_not_retried_and_is_diagnosed(caplog: pytest.LogCaptureFixture) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(400, text="bad request")

    provider = USDAProvider(
        "secret-key",
        transport=httpx.MockTransport(handler),
        max_retries=2,
        retry_base_delay=0,
    )
    with caplog.at_level(logging.WARNING, logger="app.providers.http"):
        with pytest.raises(FoodProviderError) as error:
            asyncio.run(provider.search("alma"))

    assert calls == 1
    assert error.value.status_code == 400
    assert error.value.kind == "bad_request"
    assert "source=usda" in caplog.text
    assert "request_type=search" in caplog.text
    assert "status=400" in caplog.text
    assert "response_time_ms=" in caplog.text
    assert "secret-key" not in caplog.text
    assert "api_key" not in caplog.text


def test_usda_rate_limit_retries_then_succeeds() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, json={"foods": []})

    provider = USDAProvider(
        "test-key",
        transport=httpx.MockTransport(handler),
        max_retries=2,
        retry_base_delay=0,
    )

    assert asyncio.run(provider.search("rizs")) == []
    assert calls == 2


def test_off_timeout_retries_then_succeeds() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ReadTimeout("timed out", request=request)
        return httpx.Response(200, json={"products": []})

    provider = OpenFoodFactsProvider(
        transport=httpx.MockTransport(handler),
        max_retries=1,
        retry_base_delay=0,
    )

    assert asyncio.run(provider.search("alma")) == []
    assert calls == 2


def test_off_authentication_error_is_not_retried() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(403, text="forbidden")

    provider = OpenFoodFactsProvider(
        transport=httpx.MockTransport(handler),
        max_retries=2,
        retry_base_delay=0,
    )
    with pytest.raises(FoodProviderError) as error:
        asyncio.run(provider.search("Activia banan"))

    assert calls == 1
    assert error.value.kind == "authentication"
    assert error.value.status_code == 403


def test_network_error_is_retried_only_with_a_bounded_budget() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        raise httpx.ConnectError("offline", request=request)

    provider = OpenFoodFactsProvider(
        transport=httpx.MockTransport(handler),
        max_retries=2,
        retry_base_delay=0,
    )
    with pytest.raises(FoodProviderError) as error:
        asyncio.run(provider.search("rizs"))

    assert calls == 3
    assert error.value.kind == "network_error"
