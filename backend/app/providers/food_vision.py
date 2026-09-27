from __future__ import annotations

import base64
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Protocol

import httpx


class FoodVisionError(RuntimeError):
    def __init__(self, message: str, *, kind: str = "provider_error", status_code: int | None = None) -> None:
        super().__init__(message)
        self.kind = kind
        self.status_code = status_code


@dataclass(frozen=True)
class FoodVisionSuggestion:
    name: str
    confidence: float | None
    possible_ingredients: tuple[str, ...]


@dataclass(frozen=True)
class FoodVisionResult:
    suggestions: tuple[FoodVisionSuggestion, ...]
    uncertain: bool
    provider: str


class FoodVisionProvider(Protocol):
    async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
        ...


def _bounded_text(value: object, maximum: int) -> str:
    return str(value).strip()[:maximum] if value is not None else ""


_UNCERTAIN_PREFIX = "uncertain: "


def _comparison_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value).casefold()
    normalized = "".join(character for character in normalized if not unicodedata.combining(character))
    normalized = re.sub(r"[^\w]+", " ", normalized, flags=re.UNICODE)
    return " ".join(normalized.split())


def _ingredient_text(value: object) -> str:
    """Accept the documented string format and tolerate object responses safely."""
    if isinstance(value, dict):
        name = _bounded_text(value.get("name", value.get("ingredient")), 120)
        if not name:
            return ""
        return f"{_UNCERTAIN_PREFIX}{name}" if bool(value.get("uncertain", True)) else name
    return _bounded_text(value, 120)


def _deduplicate_ingredients(values: list[object]) -> tuple[str, ...]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        text = _ingredient_text(value)
        if not text:
            continue
        # Keep the uncertainty marker stable for clients and comparisons.
        if text.casefold().startswith("uncertain:"):
            text = f"{_UNCERTAIN_PREFIX}{text.split(':', 1)[1].strip()}"
        key = _comparison_key(text.removeprefix(_UNCERTAIN_PREFIX))
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(text)
    return tuple(result[:12])


def _parse_result(value: object, provider: str) -> FoodVisionResult:
    if not isinstance(value, dict):
        raise FoodVisionError("A képfelismerő válasza érvénytelen", kind="invalid_response")
    raw_suggestions = value.get("suggestions")
    if not isinstance(raw_suggestions, list):
        raw_suggestions = []
    suggestions: list[FoodVisionSuggestion] = []
    seen_names: set[str] = set()
    for item in raw_suggestions[:16]:
        if not isinstance(item, dict):
            continue
        name = _bounded_text(item.get("name"), 120)
        if not name:
            continue
        name_key = _comparison_key(name)
        if not name_key or name_key in seen_names:
            continue
        confidence_value = item.get("confidence")
        confidence: float | None
        try:
            confidence = max(0.0, min(1.0, float(confidence_value))) if confidence_value is not None else None
        except (TypeError, ValueError):
            confidence = None
        raw_ingredients = item.get("possible_ingredients")
        ingredients = _deduplicate_ingredients(raw_ingredients) if isinstance(raw_ingredients, list) else ()
        suggestions.append(FoodVisionSuggestion(name=name, confidence=confidence, possible_ingredients=ingredients))
        seen_names.add(name_key)
        if len(suggestions) >= 3:
            break
    ingredient_uncertain = any(
        ingredient.casefold().startswith(_UNCERTAIN_PREFIX) for suggestion in suggestions for ingredient in suggestion.possible_ingredients
    )
    return FoodVisionResult(
        suggestions=tuple(suggestions),
        uncertain=bool(value.get("uncertain", not suggestions)) or ingredient_uncertain,
        provider=provider,
    )


class DisabledFoodVisionProvider:
    async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
        raise FoodVisionError("Az AI-ételelemzés nincs engedélyezve", kind="disabled")


class MockFoodVisionProvider:
    """Deterministic provider used by tests; it never calls a network service."""

    def __init__(self, result: FoodVisionResult | None = None) -> None:
        self.result = result or FoodVisionResult(
            suggestions=(FoodVisionSuggestion("Mock étel", 0.9, ("összetevő" ,)),),
            uncertain=False,
            provider="mock",
        )

    async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
        return self.result


class GeminiFoodVisionProvider:
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: float = 20.0,
        transport: httpx.AsyncBaseTransport | None = None,
        max_output_tokens: int = 1024,
    ) -> None:
        self.api_key = api_key
        self.model = model.strip().removeprefix("models/")
        self.timeout = timeout
        self.transport = transport
        self.max_output_tokens = max(1, int(max_output_tokens))

    async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
        prompt = (
            "Identify the single photographed food for a nutrition app. Return JSON only, with this shape: "
            '{"suggestions":[{"name":"...","confidence":0.0,"possible_ingredients":["..."]}],"uncertain":true}. '
            "Return at most three suggestions and include only materially different foods. "
            "Do not repeat the same food because of spelling, language, capitalization, brand or package wording; "
            "merge such duplicates into one canonical name. "
            "List possible ingredients only when visible or strongly supported by the label. "
            "Every ingredient that is uncertain must be prefixed exactly with 'uncertain: '. "
            "Set uncertain true when the food identity or any ingredient is uncertain, and use low confidence then. "
            "Never invent carbohydrate, calorie, gram or serving values."
        )
        generation_config = {
            "responseMimeType": "application/json",
            "maxOutputTokens": self.max_output_tokens,
        }
        if self.model.casefold().startswith("gemini-3"):
            generation_config["thinkingConfig"] = {"thinkingLevel": "low"}
        payload = {
            "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image).decode("ascii")}}]}],
            "generationConfig": generation_config,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
                response = await client.post(self.endpoint.format(model=self.model), headers={"x-goog-api-key": self.api_key}, json=payload)
        except httpx.TimeoutException as exc:
            raise FoodVisionError("A képfelismerő szolgáltatás időtúllépéssel válaszolt", kind="timeout") from exc
        except httpx.RequestError as exc:
            raise FoodVisionError("A képfelismerő szolgáltatás nem érhető el", kind="network_error") from exc
        if response.status_code == 429:
            raise FoodVisionError("A képfelismerő szolgáltatás korlátot jelzett", kind="rate_limit", status_code=429)
        if response.status_code >= 400:
            raise FoodVisionError("A képfelismerő szolgáltatás hibát jelzett", kind="provider_error", status_code=response.status_code)
        try:
            body = response.json()
            text = body["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(text)
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise FoodVisionError("A képfelismerő válasza nem értelmezhető", kind="invalid_response") from exc
        return _parse_result(parsed, "gemini")
