import asyncio
import json
import ssl
import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.providers.food_vision import DisabledFoodVisionProvider, FoodVisionError, FoodVisionResult, FoodVisionSuggestion, GeminiFoodVisionProvider, MockFoodVisionProvider, RecipeGenerationResult, RecipeSuggestion, _parse_recipe_result, _parse_result


def test_food_vision_is_disabled_by_default(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "vision_enabled", False)
    response = TestClient(main.app).post("/api/vision/food", files={"image": ("food.jpg", b"image", "image/jpeg")})
    assert response.status_code == 503


def test_gemini_provider_uses_verified_system_trust_context() -> None:
    provider = GeminiFoodVisionProvider("test-secret", "gemini-test", transport=httpx.MockTransport(lambda request: httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": '{"suggestions":[],"uncertain":true}'}]}}]})))
    assert provider.tls_context.verify_mode == ssl.CERT_REQUIRED
    assert provider.tls_context.check_hostname is True


def test_food_vision_mock_returns_suggestions_without_external_call(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "database_url", None)
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
    monkeypatch.setattr(main.settings, "database_url", None)
    monkeypatch.setattr(main.settings, "vision_enabled", True)
    monkeypatch.setattr(main, "food_vision_provider", MockFoodVisionProvider())
    monkeypatch.setattr(main.settings, "vision_max_image_bytes", 3)
    response = TestClient(main.app).post("/api/vision/food", files={"image": ("food.txt", b"abc", "text/plain")})
    assert response.status_code == 415
    response = TestClient(main.app).post("/api/vision/food", files={"image": ("food.jpg", b"abcd", "image/jpeg")})
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "image_too_large"


def test_food_vision_reports_disabled_and_unconfigured_states(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "database_url", None)
    client = TestClient(main.app)
    monkeypatch.setattr(main.settings, "vision_enabled", False)
    disabled = client.post("/api/vision/food", files={"image": ("food.jpg", b"image", "image/jpeg")})
    assert disabled.status_code == 503
    assert disabled.json()["detail"]["code"] == "vision_disabled"

    monkeypatch.setattr(main.settings, "vision_enabled", True)
    monkeypatch.setattr(main.settings, "gemini_api_key", "")
    monkeypatch.setattr(main, "food_vision_provider", DisabledFoodVisionProvider())
    unconfigured = client.post("/api/vision/food", files={"image": ("food.jpg", b"image", "image/jpeg")})
    assert unconfigured.status_code == 503
    assert unconfigured.json()["detail"]["code"] == "vision_unconfigured"


@pytest.mark.parametrize(
    ("kind", "status", "code"),
    [
        ("timeout", 504, "provider_timeout"),
        ("network_error", 502, "provider_unavailable"),
        ("invalid_response", 502, "provider_invalid_response"),
        ("rate_limit", 429, "provider_rate_limit"),
    ],
)
def test_food_vision_maps_provider_failures_to_stable_codes(monkeypatch, kind: str, status: int, code: str) -> None:
    monkeypatch.setattr(main.settings, "database_url", None)
    monkeypatch.setattr(main.settings, "vision_enabled", True)
    monkeypatch.setattr(main.settings, "gemini_api_key", "configured-for-test")

    class ErrorProvider:
        async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
            raise FoodVisionError("provider failure", kind=kind)

    monkeypatch.setattr(main, "food_vision_provider", ErrorProvider())
    main._vision_requests.clear()
    main._vision_daily.clear()
    response = TestClient(main.app).post("/api/vision/food", files={"image": ("food.jpg", b"image", "image/jpeg")})
    assert response.status_code == status
    assert response.json()["detail"]["code"] == code


def test_gemini_provider_sends_image_server_side_and_maps_structured_response() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-goog-api-key"] == "test-secret"
        assert request.url.path.endswith("/models/gemini-3.8-flash:generateContent")
        body = json.loads(request.content)
        assert body["contents"][0]["parts"][1]["inline_data"]["data"]
        prompt = body["contents"][0]["parts"][0]["text"]
        assert "human-facing value in the name and possible_ingredients fields in Hungarian" in prompt
        assert "Keep the JSON field names exactly as specified" in prompt
        assert "Never invent carbohydrate, calorie, gram or serving values" in prompt
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


def test_gemini_provider_batches_fridge_photos_and_generates_structured_recipes() -> None:
    requests: list[dict[str, object]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        requests.append(payload)
        if len(requests) == 1:
            assert len(payload["contents"][0]["parts"]) == 3
            assert "refrigerator photographs" in payload["contents"][0]["parts"][0]["text"]
            assert payload["generationConfig"]["maxOutputTokens"] == 1024
            text = '{"suggestions":[{"name":"Tej","confidence":0.7,"possible_ingredients":[]},{"name":"Tojás","confidence":0.6,"possible_ingredients":[]}],"uncertain":false}'
        else:
            prompt = payload["contents"][0]["parts"][0]["text"]
            assert "Készíts" in prompt and "magyar receptjavaslatot" in prompt
            assert "Ne adj meg szénhidrát" in prompt
            assert payload["generationConfig"]["maxOutputTokens"] == 2048
            text = '{"recipes":[{"name":"Tejes omlett","description":"Gyors étel.","ingredients":["tej","tojás"],"missing_ingredients":[],"instructions":["Keverd össze."],"servings":2,"notes":null}]}'
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": text}]}}]})

    provider = GeminiFoodVisionProvider("test-secret", "gemini-3.8-flash", transport=httpx.MockTransport(handler), recipe_max_output_tokens=2048)
    fridge = asyncio.run(provider.identify_many([(b"one", "image/jpeg"), (b"two", "image/jpeg")], mode="fridge"))
    recipes = asyncio.run(provider.generate_recipes(ingredients=("tej", "tojás"), meal_type="dinner", servings=2, required=(), excluded=(), carbohydrate_limit_g=None))
    assert [item.name for item in fridge.suggestions] == ["Tej", "Tojás"]
    assert recipes.recipes[0].name == "Tejes omlett"


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


def test_fridge_endpoint_batches_images_once_and_preserves_distinct_foods(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "database_url", None)
    monkeypatch.setattr(main.settings, "vision_enabled", True)
    monkeypatch.setattr(main.settings, "gemini_api_key", "configured-for-test")
    observed: list[tuple[bytes, str]] = []

    class BatchProvider:
        async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
            raise AssertionError("single-image path used")

        async def identify_many(self, images: list[tuple[bytes, str]], mode: str = "food") -> FoodVisionResult:
            observed.extend(images)
            assert mode == "fridge"
            return FoodVisionResult(
                suggestions=(FoodVisionSuggestion("Tej", None, ()), FoodVisionSuggestion("Tojás", None, ())),
                uncertain=True,
                provider="mock",
            )

        async def generate_recipes(self, **kwargs: object) -> RecipeGenerationResult:
            raise AssertionError("recipe path used")

    monkeypatch.setattr(main, "food_vision_provider", BatchProvider())
    main._vision_requests.clear(); main._vision_daily.clear()
    response = TestClient(main.app).post("/api/vision/fridge", files=[
        ("images", ("one.jpg", b"one", "image/jpeg")),
        ("images", ("two.jpg", b"two", "image/jpeg")),
    ])
    assert response.status_code == 200
    assert observed == [(b"one", "image/jpeg"), (b"two", "image/jpeg")]
    assert [item["name"] for item in response.json()["suggestions"]] == ["Tej", "Tojás"]


def test_recipe_generation_endpoint_uses_shared_provider_and_returns_no_nutrients(monkeypatch) -> None:
    monkeypatch.setattr(main.settings, "database_url", None)
    monkeypatch.setattr(main.settings, "vision_enabled", True)
    monkeypatch.setattr(main.settings, "gemini_api_key", "configured-for-test")
    observed: dict[str, object] = {}

    class RecipeProvider:
        async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
            raise AssertionError("vision path used")

        async def identify_many(self, images: list[tuple[bytes, str]], mode: str = "food") -> FoodVisionResult:
            raise AssertionError("fridge path used")

        async def generate_recipes(self, **kwargs: object) -> RecipeGenerationResult:
            observed.update(kwargs)
            return RecipeGenerationResult((RecipeSuggestion("Zöldséges tál", "Rövid leírás", ("tej",), ("fokhagyma",), ("Keverd össze.",), 2, None),), "mock")

    monkeypatch.setattr(main, "food_vision_provider", RecipeProvider())
    main._vision_requests.clear(); main._vision_daily.clear()
    response = TestClient(main.app).post("/api/chef/recipes/generate", json={"ingredients": ["tej", "tojás"], "meal_type": "dinner", "servings": 2, "required_ingredients": ["tej"], "excluded_ingredients": ["hal"], "carbohydrate_limit_g": 35})
    assert response.status_code == 200
    assert observed["ingredients"] == ["tej", "tojás"]
    payload = response.json()
    assert payload["recipes"][0]["missing_ingredients"] == ["fokhagyma"]
    assert "carbs" not in payload["recipes"][0]


def test_recipe_parser_deduplicates_and_rejects_empty_recipe() -> None:
    result = _parse_recipe_result({"recipes": [
        {"name": "Alma tal", "description": "Egyszerű leírás.", "ingredients": ["alma", "alma"], "missing_ingredients": [], "instructions": ["Vágd fel."], "servings": 2, "carbs_g": 999},
        {"name": " alma tal ", "ingredients": ["alma"], "instructions": ["Masik"], "servings": 2},
    ]}, "mock")
    assert len(result.recipes) == 1
    assert result.recipes[0].ingredients == ("alma",)
    with pytest.raises(FoodVisionError, match="recept"):
        _parse_recipe_result({"recipes": [{"name": "Hiányos", "description": "", "ingredients": ["alma"], "instructions": ["Vágd fel."]}]}, "mock")
