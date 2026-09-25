from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
import math
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..domain.carbs import CarbohydrateInputError, validate_amount_g, validate_available_carbs_100g
from ..models import CustomFood, Food, MealEntry, Recipe, RecipeIngredient
from ..schemas import RecipeCreateRequest, RecipeIngredientResponse, RecipeMealRequest, RecipeResponse


class RecipeError(ValueError):
    pass


def _source(db: Session, profile_id: str, food_id: str | None, custom_food_id: str | None) -> Food | CustomFood:
    if bool(food_id) == bool(custom_food_id):
        raise RecipeError("Minden hozzávalóhoz pontosan egy ételforrás szükséges")
    row = db.get(Food, food_id) if food_id else db.scalar(select(CustomFood).where(CustomFood.id == custom_food_id, CustomFood.profile_id == profile_id))
    if row is None or row.available_carbs_100g is None:
        raise RecipeError("A hozzávaló CH-adata nem számolható")
    return row


def _snapshot(source: Food | CustomFood) -> dict:
    if isinstance(source, CustomFood):
        return {"name": source.name, "brand": source.brand, "source": "custom", "source_id": source.id,
                "available_carbs_100g": float(source.available_carbs_100g), "dietary_fiber_100g": source.dietary_fiber_100g}
    payload = source.source_payload if isinstance(source.source_payload, dict) else {}
    return {"name": source.name, "original_name": source.original_name, "brand": source.brand, "source": source.source,
            "source_id": source.source_id, "food_id": source.id, "available_carbs_100g": float(source.available_carbs_100g),
            "dietary_fiber_100g": payload.get("dietary_fiber_100g")}


def _response(recipe: Recipe, ingredients: list[RecipeIngredient] | None = None) -> RecipeResponse:
    rows = ingredients if ingredients is not None else []
    total = sum((Decimal(str(row.calculated_carbs_g)) for row in rows), Decimal("0"))
    servings = Decimal(str(recipe.servings))
    return RecipeResponse(id=recipe.id, name=recipe.name, instructions=recipe.instructions, prep_minutes=recipe.prep_minutes,
                          notes=recipe.notes, servings=float(servings), total_weight_g=recipe.total_weight_g,
                          total_carbs_g=float(total), carbs_per_serving_g=float(total / servings), is_favorite=recipe.is_favorite,
                          ingredients=[RecipeIngredientResponse(id=row.id, food_id=row.food_id, custom_food_id=row.custom_food_id,
                              quantity_g=float(row.quantity_g), calculated_carbs_g=float(row.calculated_carbs_g), snapshot=row.snapshot, position=row.position) for row in rows],
                          created_at=recipe.created_at, updated_at=recipe.updated_at)


def _build(db: Session, profile_id: str, payload: RecipeCreateRequest, recipe: Recipe | None = None) -> RecipeResponse:
    if not math.isfinite(payload.servings) or payload.servings <= 0 or payload.servings > 100000:
        raise RecipeError("A recept adagjainak száma érvénytelen")
    if payload.total_weight_g is not None and (not math.isfinite(payload.total_weight_g) or payload.total_weight_g <= 0):
        raise RecipeError("A recept össztömege érvénytelen")
    if recipe is None:
        recipe = Recipe(profile_id=profile_id, name=payload.name.strip(), servings=payload.servings,
                        total_weight_g=payload.total_weight_g, instructions=payload.instructions, prep_minutes=payload.prep_minutes,
                        notes=payload.notes, is_favorite=payload.is_favorite)
        db.add(recipe)
        db.flush()
    else:
        recipe.name = payload.name.strip(); recipe.servings = payload.servings; recipe.total_weight_g = payload.total_weight_g
        recipe.instructions = payload.instructions; recipe.prep_minutes = payload.prep_minutes; recipe.notes = payload.notes
        recipe.is_favorite = payload.is_favorite
        for old in list(db.scalars(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id))): db.delete(old)
        db.flush()
    rows: list[RecipeIngredient] = []
    for position, item in enumerate(payload.ingredients):
        try: quantity = Decimal(str(validate_amount_g(item.quantity_g)))
        except (CarbohydrateInputError, TypeError, ValueError) as exc: raise RecipeError("A hozzávaló mennyisége érvénytelen") from exc
        source = _source(db, profile_id, item.food_id, item.custom_food_id)
        carbs = quantity * Decimal(str(validate_available_carbs_100g(source.available_carbs_100g))) / Decimal("100")
        row = RecipeIngredient(recipe_id=recipe.id, food_id=source.id if isinstance(source, Food) else None,
                               custom_food_id=source.id if isinstance(source, CustomFood) else None, quantity_g=quantity,
                               calculated_carbs_g=carbs, snapshot=_snapshot(source), position=position)
        db.add(row); rows.append(row)
    db.commit(); db.refresh(recipe)
    return _response(recipe, rows)


def list_recipes(db: Session, profile_id: str) -> list[RecipeResponse]:
    recipes = list(db.scalars(select(Recipe).where(Recipe.profile_id == profile_id).order_by(Recipe.name.asc())))
    return [_response(recipe, list(db.scalars(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id).order_by(RecipeIngredient.position)))) for recipe in recipes]


def get_recipe(db: Session, profile_id: str, recipe_id: str) -> Recipe:
    recipe = db.scalar(select(Recipe).where(Recipe.id == recipe_id, Recipe.profile_id == profile_id))
    if recipe is None: raise RecipeError("A recept nem található")
    return recipe


def get_recipe_response(db: Session, profile_id: str, recipe_id: str) -> RecipeResponse:
    recipe = get_recipe(db, profile_id, recipe_id)
    return _response(recipe, list(db.scalars(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id).order_by(RecipeIngredient.position))))


def create_recipe(db: Session, profile_id: str, payload: RecipeCreateRequest) -> RecipeResponse: return _build(db, profile_id, payload)


def update_recipe(db: Session, profile_id: str, recipe_id: str, payload: RecipeCreateRequest) -> RecipeResponse: return _build(db, profile_id, payload, get_recipe(db, profile_id, recipe_id))


def delete_recipe(db: Session, profile_id: str, recipe_id: str) -> None:
    db.delete(get_recipe(db, profile_id, recipe_id)); db.commit()


def toggle_recipe_favorite(db: Session, profile_id: str, recipe_id: str) -> RecipeResponse:
    recipe = get_recipe(db, profile_id, recipe_id); recipe.is_favorite = not recipe.is_favorite; db.commit(); return get_recipe_response(db, profile_id, recipe_id)


def log_recipe_meal(db: Session, profile_id: str, recipe_id: str, payload: RecipeMealRequest, timezone: str, consumed_at: datetime | None = None) -> MealEntry:
    existing = db.scalar(select(MealEntry).where(MealEntry.profile_id == profile_id, MealEntry.idempotency_key == payload.idempotency_key))
    if existing is not None:
        if existing.recipe_id != recipe_id:
            raise RecipeError("Az idempotencia-kulcs már más bejegyzéshez tartozik")
        return existing
    recipe = get_recipe(db, profile_id, recipe_id)
    ingredients = list(db.scalars(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id).order_by(RecipeIngredient.position)))
    total = sum((Decimal(str(row.calculated_carbs_g)) for row in ingredients), Decimal("0"))
    try:
        quantity = Decimal(str(validate_amount_g(payload.quantity)))
    except (CarbohydrateInputError, TypeError, ValueError) as exc:
        raise RecipeError("A recept mennyisége érvénytelen") from exc
    servings = Decimal(str(recipe.servings))
    if payload.quantity_unit == "servings": carbs = quantity * total / servings
    else:
        if not recipe.total_weight_g: raise RecipeError("A recept össztömege szükséges gramm alapú naplózáshoz")
        carbs = quantity * total / Decimal(str(recipe.total_weight_g))
    when = consumed_at or datetime.now(UTC)
    entry = MealEntry(profile_id=profile_id, recipe_id=recipe.id, consumed_at=when, local_date=payload.local_date or when.date(), timezone=timezone,
                      amount_g=quantity, quantity_unit=payload.quantity_unit, meal_category=payload.meal_category,
                      idempotency_key=payload.idempotency_key, calculated_carbs_g=carbs,
                      snapshot={"snapshot_version": 1, "calculation_version": "m8-recipe-v1", "name": recipe.name,
                                "source": "recipe", "source_id": recipe.id, "servings": float(servings), "quantity": float(quantity),
                                "quantity_unit": payload.quantity_unit, "total_carbs_g": float(total),
                                "ingredients": [row.snapshot | {"quantity_g": float(row.quantity_g), "calculated_carbs_g": float(row.calculated_carbs_g)} for row in ingredients]})
    db.add(entry); db.commit(); db.refresh(entry); return entry
