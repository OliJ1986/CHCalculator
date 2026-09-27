import asyncio
import json
import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.providers.food_vision import FoodVisionError, FoodVisionResult, FoodVisionSuggestion, GeminiFoodVisionProvider, MockFoodVisionProvider, _parse_result


def test_food_vision_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "vision_enabled", False)
    response = TestClient(main.app).post("/api/vision/food", files={"image": ("food.jpg", b"image", "image/jpeg")})
    assert response.status_code == 503


def test_food_vision_mock_returns_suggestions_without_external_call(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "vision_enabled", True)
    monkeypatch.setattr(main.settings, "vision_max_image_bytes", 100)
    monkeypatch.setattr(main.settings, "vision_rate_limit_per_minute", 3)
    monkeypatch.setattr(main.settings, "vision_daily_limit", 0)
    monkeypatch.setattr(main, "food_vision_provider", MockFoodVisionProvider(FoodVisionResult(
        suggestions=(FoodVisionSuggestion("Banános zabkása", 0.82, ("banán", "zab")),),
        uncertain=False,
        provider="mock",
    )))
    main._vision_requests.clear()
    main._vision_daily.clear()
    response = TestClient(main.app).post("/api/vision/food", files={"image": ("food.jpg", b"image", "image/jpeg")})
    assert response.status_code == 200
    assert response.json() == {"suggestions": [{"name": "Banános zabkása", "confidence": 0.82, "possible_ingredients": ["banán", "zab"]}], "uncertain": False, "provider": "mock"}


def test_food_vision_rejects_non_image_and_oversized_payload(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "vision_enabled", True)
    monkeypatch.setattr(main, "food_vision_provider", MockFoodVisionProvider())
    monkeypatch.setattr(main.settings, "vision_max_image_bytes", 3)
    response = TestClient(main.app).post("/api/vision/food", files={"image": ("food.txt", b"abc", "text/plain")})
    assert response.status_code == 415
    response = TestClient(main.app).post("/api/vision/food", files={"image": ("food.jpg", b"abcd", "image/jpeg")})
    assert response.status_code == 413


def test_gemini_provider_sends_image_server_side_and_maps_structured_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "test-secret"
        assert request.url.path.endswith("/models/gemini-3.8-flash:generateContent")
        body = json.loads(request.content)
        assert body["contents"][0]["parts"][1]["inline_data"]["data"]
        prompt = body["contents"][0]["parts"][0]["text"]
        assert "Do not repeat the same food" in prompt
        assert body["generationConfig"]["maxOutputTokens"] == 1024
        assert body["generationConfig"]["thinkingConfig"] == {"thinkingLevel": "low"}
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": '{"suggestions":[{"name":"Alma","confidence":0.7,"possible_ingredients":["alma"]}],"uncertain":false}'}]}}]})

    provider = GeminiFoodVisionProvider("test-secret", "models/gemini-3.8-flash", transport=httpx.MockTransport(handler), timeout=1)
    result = asyncio.run(provider.identify(b"image", "image/jpeg"))
    assert result.provider == "gemini"
    assert result.suggestions[0].name == "Alma"
    assert result.uncertain is False


def test_gemini_parser_deduplicates_names_and_marks_uncertain_ingredients() -> None:
    result = _parse_result(
        {
            "suggestions": [
                {"name": "Banana, raw", "confidence": 0.8, "possible_ingredients": ["banana", "uncertain: milk", "milk"]},
                {"name": " banana raw ", "confidence": 0.7, "possible_ingredients": ["banana"]},
                {"name": "Banana chips", "confidence": 0.4, "possible_ingredients": [{"name": "sugar", "uncertain": True}]},
                {"name": "Another result", "confidence": 0.2, "possible_ingredients": []},
            ],
            "uncertain": False,
        },
        "mock",
    )
    assert [suggestion.name for suggestion in result.suggestions] == ["Banana, raw", "Banana chips", "Another result"]
    assert result.suggestions[0].possible_ingredients == ("banana", "uncertain: milk")
    assert result.suggestions[1].possible_ingredients == ("uncertain: sugar",)
    assert result.uncertain is True


def test_gemini_provider_keeps_legacy_models_compatible() -> None:
    observed: dict[str, object] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        observed.update(json.loads(request.content)["generationConfig"])
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": '{"suggestions":[],"uncertain":true}'}]}}]})

    provider = GeminiFoodVisionProvider("test-secret", "gemini-2.5-flash-lite", transport=httpx.MockTransport(handler))
    result = asyncio.run(provider.identify(b"image", "image/jpeg"))
    assert result.uncertain is True
    assert "thinkingConfig" not in observed


def test_gemini_provider_rejects_invalid_structured_response() -> None:
    provider = GeminiFoodVisionProvider(
        "test-secret",
        "gemini-test",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"candidates": []})),
        timeout=1,
    )
    with pytest.raises(FoodVisionError) as error:
        asyncio.run(provider.identify(b"image", "image/jpeg"))
    assert error.value.kind == "invalid_response"
