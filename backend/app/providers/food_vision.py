from __future__ import annotations

import base64
import json
import re
import ssl
import unicodedata
from dataclasses import dataclass
from typing import Protocol, Sequence

import httpx
import truststore


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


@dataclass(frozen=True)
class RecipeSuggestion:
    name: str
    description: str
    ingredients: tuple[str, ...]
    missing_ingredients: tuple[str, ...]
    instructions: tuple[str, ...]
    servings: float | None
    notes: str | None


@dataclass(frozen=True)
class RecipeGenerationResult:
    recipes: tuple[RecipeSuggestion, ...]
    provider: str


class FoodVisionProvider(Protocol):
    async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
        ...

    async def identify_many(self, images: Sequence[tuple[bytes, str]]) -> FoodVisionResult:
        ...

    async def generate_recipes(self, *, ingredients: Sequence[str], meal_type: str, servings: float,
                               required: Sequence[str], excluded: Sequence[str],
                               carbohydrate_limit_g: float | None) -> RecipeGenerationResult:
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


def _parse_result(value: object, provider: str, maximum_suggestions: int = 3) -> FoodVisionResult:
    if not isinstance(value, dict):
        raise FoodVisionError("A képfelismerő válasza érvénytelen", kind="invalid_response")
    raw_suggestions = value.get("suggestions")
    if not isinstance(raw_suggestions, list):
        raw_suggestions = []
    suggestions: list[FoodVisionSuggestion] = []
    seen_names: set[str] = set()
    for item in raw_suggestions[:64]:
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
        if len(suggestions) >= maximum_suggestions:
            break
    ingredient_uncertain = any(
        ingredient.casefold().startswith(_UNCERTAIN_PREFIX) for suggestion in suggestions for ingredient in suggestion.possible_ingredients
    )
    return FoodVisionResult(
        suggestions=tuple(suggestions),
        uncertain=bool(value.get("uncertain", not suggestions)) or ingredient_uncertain,
        provider=provider,
    )


def _string_list(value: object, maximum: int, limit: int) -> tuple[str, ...]:
    if not isinstance(value, list):
        return ()
    result: list[str] = []
    seen: set[str] = set()
    for item in value:
        if isinstance(item, dict):
            item = item.get("name", item.get("ingredient"))
        text = _bounded_text(item, maximum)
        key = _comparison_key(text)
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(text)
        if len(result) >= limit:
            break
    return tuple(result)


def _parse_recipe_result(value: object, provider: str) -> RecipeGenerationResult:
    if not isinstance(value, dict) or not isinstance(value.get("recipes"), list):
        raise FoodVisionError("A receptgeneráló válasza érvénytelen", kind="invalid_response")
    recipes: list[RecipeSuggestion] = []
    seen: set[str] = set()
    for item in value["recipes"][:8]:
        if not isinstance(item, dict):
            continue
        name = _bounded_text(item.get("name"), 160)
        key = _comparison_key(name)
        description = _bounded_text(item.get("description"), 500)
        ingredients = _string_list(item.get("ingredients"), 120, 24)
        instructions = _string_list(item.get("instructions"), 500, 12)
        if not key or key in seen or not description or not ingredients or not instructions:
            continue
        servings_value = item.get("servings")
        try:
            servings = float(servings_value) if servings_value is not None else None
        except (TypeError, ValueError):
            servings = None
        if servings is not None and (servings <= 0 or servings > 50):
            servings = None
        recipes.append(RecipeSuggestion(
            name=name,
            description=description,
            ingredients=ingredients,
            missing_ingredients=_string_list(item.get("missing_ingredients"), 120, 24),
            instructions=instructions,
            servings=servings,
            notes=_bounded_text(item.get("notes"), 500) or None,
        ))
        seen.add(key)
        if len(recipes) >= 3:
            break
    if not recipes:
        raise FoodVisionError("A receptgeneráló nem adott érvényes receptet", kind="invalid_response")
    return RecipeGenerationResult(recipes=tuple(recipes), provider=provider)


class DisabledFoodVisionProvider:
    async def identify_many(self, images: Sequence[tuple[bytes, str]], mode: str = "food") -> FoodVisionResult:
        raise FoodVisionError("vision disabled", kind="disabled")

    async def generate_recipes(self, **kwargs: object) -> RecipeGenerationResult:
        raise FoodVisionError("recipe generation disabled", kind="disabled")

    async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
        raise FoodVisionError("Az AI-ételelemzés nincs engedélyezve", kind="disabled")


class MockFoodVisionProvider:
    """Deterministic provider used by tests; it never calls a network service."""

    def __init__(self, result: FoodVisionResult | None = None, recipes: RecipeGenerationResult | None = None) -> None:
        self.result = result or FoodVisionResult(
            suggestions=(FoodVisionSuggestion("Mock étel", 0.9, ("összetevő" ,)),),
            uncertain=False,
            provider="mock",
        )
        self.recipes = recipes or RecipeGenerationResult(
            recipes=(RecipeSuggestion("Mock zöldséges tál", "Egyszerű próbarecept.", ("paradicsom", "rizs"), ("fokhagyma",), ("Keverd össze az alapanyagokat.",), 2, None),),
            provider="mock",
        )

    async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
        return self.result

    async def identify_many(self, images: Sequence[tuple[bytes, str]], mode: str = "food") -> FoodVisionResult:
        return self.result

    async def generate_recipes(self, **kwargs: object) -> RecipeGenerationResult:
        return self.recipes


class GeminiFoodVisionProvider:
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    def __init__(
        self,
        api_key: str,
        model: str,
        timeout: float = 20.0,
        transport: httpx.AsyncBaseTransport | None = None,
        max_output_tokens: int = 1024,
        recipe_max_output_tokens: int = 2048,
        tls_context: ssl.SSLContext | None = None,
    ) -> None:
        self.api_key = api_key
        self.model = model.strip().removeprefix("models/")
        self.timeout = timeout
        self.transport = transport
        self.max_output_tokens = max(1, int(max_output_tokens))
        self.recipe_max_output_tokens = max(1, int(recipe_max_output_tokens))
        self.tls_context = tls_context or truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)

    @staticmethod
    def _food_prompt(fridge: bool = False) -> str:
        return (
            ("Identify all distinct visible foods in the refrigerator photographs for a nutrition app. " if fridge else "Identify the photographed food for a nutrition app. ")
            + "Return JSON only, with this shape: "
            '{"suggestions":[{"name":"...","confidence":0.0,"possible_ingredients":["..."]}],"uncertain":true}. '
            "Return every human-facing value in the name and possible_ingredients fields in Hungarian. "
            "Keep the JSON field names exactly as specified and do not translate or rename those fields. "
            + ("Return up to twenty-four distinct visible foods and include only materially different foods. " if fridge else "Return at most three suggestions and include only materially different foods. ")
            + "Do not repeat the same food because of spelling, language, capitalization, brand or package wording; "
            "merge such duplicates into one canonical name. "
            "List possible ingredients only when visible or strongly supported by the label. "
            "Every ingredient that is uncertain must be prefixed exactly with 'uncertain: '. "
            "Set uncertain true when the food identity or any ingredient is uncertain, and use low confidence then. "
            "Never invent carbohydrate, calorie, gram or serving values."
        )

    @staticmethod
    def _recipe_prompt(ingredients: Sequence[str], meal_type: str, servings: float,
                       required: Sequence[str], excluded: Sequence[str],
                       carbohydrate_limit_g: float | None) -> str:
        clean = lambda values: ", ".join(_bounded_text(value, 120) for value in values if _bounded_text(value, 120)) or "nincs"
        limit = str(carbohydrate_limit_g) if carbohydrate_limit_g is not None else "nincs megadva"
        return (
            "Készíts legfeljebb három, egymástól lényegesen eltérő magyar receptjavaslatot egy étkezési alkalmazáshoz. "
            "Válaszolj kizárólag JSON-nal, pontosan ezzel a szerkezettel: "
            '{"recipes":[{"name":"...","description":"...","ingredients":["..."],"missing_ingredients":["..."],"instructions":["..."],"servings":2,"notes":"..."}]}. '
            f"A jóváhagyott hűtőleltár: {clean(ingredients)}. Étkezés: {meal_type or 'egyéb'}. "
            f"Alapértelmezett adag: {servings:g}. Mindenképpen használandó: {clean(required)}. "
            f"Kizárt: {clean(excluded)}. A felhasználó által megadott étkezési CH-keret: {limit}. "
            "Minden embernek szánt szöveg legyen magyar. A hiányzó hozzávalókat külön listázd. "
            "Ne találj ki olyan alapanyagot, amelyet a leltár vagy a recepthez szükséges nyilvánvaló kiegészítő nem indokol. "
            "Ne adj meg szénhidrát-, kalória- vagy más tápértéket, és ne becsülj grammokat vagy készletmennyiséget. "
            "A mennyiségeket majd a felhasználó adja meg, ezért az ingredients csak alapanyagneveket tartalmazzon. "
            "Ne minősítsd a receptet automatikusan a CH-keretbe illőnek."
        )

    async def identify(self, image: bytes, mime_type: str) -> FoodVisionResult:
        return await self.identify_many(((image, mime_type),))

    async def identify_many(self, images: Sequence[tuple[bytes, str]], mode: str = "food") -> FoodVisionResult:
        if not images:
            raise FoodVisionError("No images supplied", kind="invalid_response")
        parts: list[dict[str, object]] = [{"text": self._food_prompt(mode == "fridge")}]
        for image, mime_type in images:
            parts.append({"inline_data": {"mime_type": mime_type, "data": base64.b64encode(image).decode("ascii")}})
        generation_config: dict[str, object] = {
            "responseMimeType": "application/json",
            "maxOutputTokens": self.max_output_tokens,
        }
        if self.model.casefold().startswith("gemini-3"):
            generation_config["thinkingConfig"] = {"thinkingLevel": "low"}
        parsed = await self._request({"contents": [{"parts": parts}], "generationConfig": generation_config})
        return _parse_result(parsed, "gemini", 24 if mode == "fridge" else 3)

    async def generate_recipes(self, *, ingredients: Sequence[str], meal_type: str, servings: float,
                               required: Sequence[str], excluded: Sequence[str],
                               carbohydrate_limit_g: float | None) -> RecipeGenerationResult:
        generation_config: dict[str, object] = {
            "responseMimeType": "application/json",
            "maxOutputTokens": self.recipe_max_output_tokens,
        }
        if self.model.casefold().startswith("gemini-3"):
            generation_config["thinkingConfig"] = {"thinkingLevel": "low"}
        parsed = await self._request({
            "contents": [{"parts": [{"text": self._recipe_prompt(ingredients, meal_type, servings, required, excluded, carbohydrate_limit_g)}]}],
            "generationConfig": generation_config,
        })
        return _parse_recipe_result(parsed, "gemini")

    async def _request(self, payload: dict[str, object]) -> object:
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport, verify=self.tls_context) as client:
                response = await client.post(
                    self.endpoint.format(model=self.model),
                    headers={"x-goog-api-key": self.api_key},
                    json=payload,
                )
        except httpx.TimeoutException as exc:
            raise FoodVisionError("A képfelismerő szolgáltatás időtúllépéssel válaszolt", kind="timeout") from exc
        except httpx.RequestError as exc:
            raise FoodVisionError("A képfelismerő szolgáltatás nem érhető el", kind="network_error") from exc
        if response.status_code == 429:
            raise FoodVisionError("A szolgáltató korlátot jelzett", kind="rate_limit", status_code=429)
        if response.status_code >= 400:
            raise FoodVisionError("A szolgáltató hibát jelzett", kind="provider_error", status_code=response.status_code)
        try:
            body = response.json()
            text = body["candidates"][0]["content"]["parts"][0]["text"]
            return json.loads(text)
        except (ValueError, KeyError, IndexError, TypeError) as exc:
            raise FoodVisionError("A szolgáltató válasza nem értelmezhető", kind="invalid_response") from exc
