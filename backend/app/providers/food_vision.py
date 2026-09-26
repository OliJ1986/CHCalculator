from __future__ import annotations

import base64
import json
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


def _parse_result(value: object, provider: str) -> FoodVisionResult:
    if not isinstance(value, dict):
        raise FoodVisionError("A képfelismerő válasza érvénytelen", kind="invalid_response")
    raw_suggestions = value.get("suggestions")
    if not isinstance(raw_suggestions, list):
        raw_suggestions = []
    suggestions: list[FoodVisionSuggestion] = []
    for item in raw_suggestions[:8]:
        if not isinstance(item, dict):
            continue
        name = _bounded_text(item.get("name"), 120)
        if not name:
            continue
        confidence_value = item.get("confidence")
        confidence: float | None
        try:
            confidence = max(0.0, min(1.0, float(confidence_value))) if confidence_value is not None else None
        except (TypeError, ValueError):
            confidence = None
        raw_ingredients = item.get("possible_ingredients")
        ingredients = tuple(_bounded_text(entry, 120) for entry in raw_ingredients[:12] if _bounded_text(entry, 120)) if isinstance(raw_ingredients, list) else ()
        suggestions.append(FoodVisionSuggestion(name=name, confidence=confidence, possible_ingredients=ingredients))
    return FoodVisionResult(
        suggestions=tuple(suggestions),
        uncertain=bool(value.get("uncertain", not suggestions)),
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

    def __init__(self, api_key: str, model: str, timeout: float = 20.0, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self.api_key = api_key
        self.model = model
        self.timeout = timeout
        self.transport = transport

    async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
        prompt = (
            "Identify the photographed food for a nutrition app. Return JSON only, with this shape: "
            '{"suggestions":[{"name":"...","confidence":0.0,"possible_ingredients":["..."]}],"uncertain":true}. '
            "Suggest names and possible ingredients only. Never invent carbohydrate, calorie, gram or serving values. "
            "If uncertain, set uncertain true and keep confidence low."
        )
        payload = {
            "contents": [{"parts": [{"text": prompt}, {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image).decode("ascii")}}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1, "maxOutputTokens": 500},
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
