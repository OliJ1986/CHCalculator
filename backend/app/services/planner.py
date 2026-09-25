from __future__ import annotations

from datetime import date
from decimal import Decimal
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..domain.carbs import validate_amount_g, validate_available_carbs_100g
from ..models import CustomFood, Food, MealPlanEntry, Recipe, RecipeIngredient
from ..schemas import MealCreateRequest, MealPlanCreateRequest, MealPlanResponse, MealPlanUpdateRequest, PlanLogMealRequest
from .meals import create_meal
from .recipes import log_recipe_meal
from .recipes import RecipeError, get_recipe


class PlanError(ValueError):
    pass


def _response(row: MealPlanEntry) -> MealPlanResponse:
    return MealPlanResponse(id=row.id, plan_date=row.plan_date, meal_category=row.meal_category, food_id=row.food_id,
                            custom_food_id=row.custom_food_id, recipe_id=row.recipe_id, quantity=float(row.quantity),
                            quantity_unit=row.quantity_unit, planned_carbs_g=float(row.planned_carbs_g), snapshot=row.snapshot,
                            created_at=row.created_at, updated_at=row.updated_at)


def _resolve(db: Session, profile_id: str, payload: MealPlanCreateRequest):
    sources = [bool(payload.food_id), bool(payload.custom_food_id), bool(payload.recipe_id)]
    if sum(sources) != 1: raise PlanError("Pontosan egy tervezett forrás szükséges")
    quantity = Decimal(str(validate_amount_g(payload.quantity)))
    if payload.recipe_id:
        recipe = get_recipe(db, profile_id, payload.recipe_id)
        rows = list(db.scalars(select(RecipeIngredient).where(RecipeIngredient.recipe_id == recipe.id)))
        total = sum((Decimal(str(row.calculated_carbs_g)) for row in rows), Decimal("0"))
        if payload.quantity_unit == "servings": carbs = quantity * total / Decimal(str(recipe.servings))
        elif recipe.total_weight_g: carbs = quantity * total / Decimal(str(recipe.total_weight_g))
        else: raise PlanError("A recept össztömege szükséges gramm alapú tervezéshez")
        return recipe.id, None, None, carbs, {"name": recipe.name, "source": "recipe", "source_id": recipe.id, "quantity": float(quantity), "quantity_unit": payload.quantity_unit, "servings": float(recipe.servings), "total_weight_g": recipe.total_weight_g,
                                              "ingredients": [row.snapshot | {"quantity_g": float(row.quantity_g)} for row in rows]}
    if payload.food_id:
        source = db.get(Food, payload.food_id)
        if source is None or source.available_carbs_100g is None: raise PlanError("Az étel CH-adata nem számolható")
        carbs = quantity * Decimal(str(validate_available_carbs_100g(source.available_carbs_100g))) / Decimal("100")
        return None, source.id, None, carbs, {"name": source.name, "source": source.source, "source_id": source.source_id, "available_carbs_100g": float(source.available_carbs_100g)}
    source = db.scalar(select(CustomFood).where(CustomFood.id == payload.custom_food_id, CustomFood.profile_id == profile_id))
    if source is None: raise PlanError("A saját étel nem található")
    carbs = quantity * Decimal(str(validate_available_carbs_100g(source.available_carbs_100g))) / Decimal("100")
    return None, None, source.id, carbs, {"name": source.name, "source": "custom", "source_id": source.id, "available_carbs_100g": float(source.available_carbs_100g)}


def list_plans(db: Session, profile_id: str, start: date | None = None, end: date | None = None) -> list[MealPlanResponse]:
    statement = select(MealPlanEntry).where(MealPlanEntry.profile_id == profile_id).order_by(MealPlanEntry.plan_date, MealPlanEntry.created_at)
    if start: statement = statement.where(MealPlanEntry.plan_date >= start)
    if end: statement = statement.where(MealPlanEntry.plan_date <= end)
    return [_response(row) for row in db.scalars(statement)]


def create_plan(db: Session, profile_id: str, payload: MealPlanCreateRequest) -> MealPlanResponse:
    recipe_id, food_id, custom_id, carbs, snapshot = _resolve(db, profile_id, payload)
    row = MealPlanEntry(profile_id=profile_id, plan_date=payload.plan_date, meal_category=payload.meal_category, recipe_id=recipe_id,
                        food_id=food_id, custom_food_id=custom_id, quantity=payload.quantity, quantity_unit=payload.quantity_unit,
                        planned_carbs_g=carbs, snapshot=snapshot)
    db.add(row); db.commit(); db.refresh(row); return _response(row)


def get_plan(db: Session, profile_id: str, plan_id: str) -> MealPlanEntry:
    row = db.scalar(select(MealPlanEntry).where(MealPlanEntry.id == plan_id, MealPlanEntry.profile_id == profile_id))
    if row is None: raise PlanError("A tervezett étkezés nem található")
    return row


def update_plan(db: Session, profile_id: str, plan_id: str, payload: MealPlanUpdateRequest) -> MealPlanResponse:
    row = get_plan(db, profile_id, plan_id)
    if payload.plan_date is not None: row.plan_date = payload.plan_date
    if payload.meal_category is not None: row.meal_category = payload.meal_category
    if payload.quantity is not None or payload.quantity_unit is not None:
        source_payload = MealPlanCreateRequest(plan_date=row.plan_date, meal_category=row.meal_category,
            food_id=row.food_id, custom_food_id=row.custom_food_id, recipe_id=row.recipe_id,
            quantity=payload.quantity if payload.quantity is not None else float(row.quantity),
            quantity_unit=payload.quantity_unit or row.quantity_unit)
        recipe_id, food_id, custom_id, carbs, snapshot = _resolve(db, profile_id, source_payload)
        row.quantity = source_payload.quantity; row.quantity_unit = source_payload.quantity_unit
        row.planned_carbs_g = carbs; row.snapshot = snapshot
        row.recipe_id = recipe_id; row.food_id = food_id; row.custom_food_id = custom_id
    db.commit(); db.refresh(row); return _response(row)


def delete_plan(db: Session, profile_id: str, plan_id: str) -> None:
    db.delete(get_plan(db, profile_id, plan_id)); db.commit()


def copy_plan(db: Session, profile_id: str, plan_id: str, target_date: date) -> MealPlanResponse:
    source = get_plan(db, profile_id, plan_id)
    existing = db.scalar(select(MealPlanEntry).where(
        MealPlanEntry.profile_id == profile_id, MealPlanEntry.plan_date == target_date,
        MealPlanEntry.meal_category == source.meal_category, MealPlanEntry.food_id == source.food_id,
        MealPlanEntry.custom_food_id == source.custom_food_id, MealPlanEntry.recipe_id == source.recipe_id,
        MealPlanEntry.quantity == source.quantity, MealPlanEntry.quantity_unit == source.quantity_unit,
    ))
    if existing is not None:
        return _response(existing)
    row = MealPlanEntry(profile_id=profile_id, plan_date=target_date, meal_category=source.meal_category,
                        food_id=source.food_id, custom_food_id=source.custom_food_id, recipe_id=source.recipe_id,
                        quantity=source.quantity, quantity_unit=source.quantity_unit,
                        planned_carbs_g=source.planned_carbs_g, snapshot=source.snapshot)
    db.add(row); db.commit(); db.refresh(row)
    return _response(row)


def log_plan_meal(db: Session, profile_id: str, plan_id: str, payload: PlanLogMealRequest):
    row = get_plan(db, profile_id, plan_id)
    if row.recipe_id:
        from ..schemas import RecipeMealRequest
        return log_recipe_meal(db, profile_id, row.recipe_id, RecipeMealRequest(quantity=float(row.quantity), quantity_unit=row.quantity_unit,
            local_date=payload.local_date or row.plan_date, meal_category=row.meal_category,
            timezone=payload.timezone, idempotency_key=payload.idempotency_key), payload.timezone or "Europe/Budapest", payload.consumed_at)
    request = MealCreateRequest(food_id=row.food_id, custom_food_id=row.custom_food_id, amount_g=float(row.quantity),
        consumed_at=payload.consumed_at, local_date=payload.local_date or row.plan_date, timezone=payload.timezone,
        meal_category=row.meal_category, idempotency_key=payload.idempotency_key)
    return create_meal(db, request, profile_id)
