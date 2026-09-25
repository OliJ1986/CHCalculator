from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..domain.carbs import CarbohydrateInputError, calculate_carbohydrate
from ..models import CustomFood, GoalVersion, MealEntry, MealPlanEntry, Profile, Recipe, RecipeIngredient, ShoppingItem
from ..domain.carbs import validate_available_carbs_100g
from ..schemas import GuestImportRequest
from .goals import CATEGORY_LABELS, _target


class GuestImportError(ValueError):
    pass


def import_guest_data(db: Session, profile: Profile, request: GuestImportRequest) -> tuple[int, ...]:
    imported_meals = skipped_meals = imported_goals = skipped_goals = 0
    imported_custom_foods = skipped_custom_foods = 0
    imported_recipes = skipped_recipes = imported_plans = skipped_plans = imported_shopping = skipped_shopping = 0
    custom_id_map: dict[str, str] = {}
    try:
        for item in request.custom_foods:
            try:
                carbs = validate_available_carbs_100g(item.available_carbs_100g)
            except (CarbohydrateInputError, TypeError, ValueError) as exc:
                raise GuestImportError("A vendég saját étel CH-adata nem számolható") from exc
            brand = item.brand.strip() if item.brand else None
            current = db.scalar(select(CustomFood).where(CustomFood.profile_id == profile.id, CustomFood.name == item.name.strip(), CustomFood.brand == brand))
            if current is not None:
                same = float(current.available_carbs_100g) == float(carbs) and current.dietary_fiber_100g == item.dietary_fiber_100g and current.serving_size_g == item.serving_size_g and current.notes == item.notes
                if same:
                    custom_id_map[item.id] = current.id
                    skipped_custom_foods += 1
                    continue
                if not request.overwrite_existing:
                    raise GuestImportError("A meglévő saját étel eltérő adatot tartalmaz; megerősítés szükséges")
                current.available_carbs_100g = carbs; current.dietary_fiber_100g = item.dietary_fiber_100g; current.serving_size_g = item.serving_size_g; current.notes = item.notes; current.is_favorite = item.is_favorite
                custom_id_map[item.id] = current.id
                imported_custom_foods += 1
                continue
            requested_id = item.id
            existing_id = db.get(CustomFood, requested_id)
            row_id = requested_id if existing_id is None else None
            row = CustomFood(id=row_id, profile_id=profile.id, name=item.name.strip(), brand=brand, available_carbs_100g=carbs,
                              dietary_fiber_100g=item.dietary_fiber_100g, serving_size_g=item.serving_size_g, notes=item.notes, is_favorite=item.is_favorite)
            db.add(row); db.flush(); custom_id_map[item.id] = row.id
            imported_custom_foods += 1

        for item in request.recipes:
            existing = db.scalar(select(Recipe).where(Recipe.profile_id == profile.id, Recipe.id == item.id))
            if existing is not None:
                existing_rows = list(db.scalars(select(RecipeIngredient).where(RecipeIngredient.recipe_id == existing.id).order_by(RecipeIngredient.position)))
                same = existing.name == item.name and float(existing.servings) == float(item.servings) and [row.snapshot for row in existing_rows] == [ingredient.snapshot for ingredient in item.ingredients]
                if same: skipped_recipes += 1; continue
                if not request.overwrite_existing: raise GuestImportError("A meglévő vendég recept eltérő adatot tartalmaz; megerősítés szükséges")
                for row in existing_rows: db.delete(row)
                recipe = existing
            else:
                recipe = Recipe(id=item.id if db.get(Recipe, item.id) is None else None, profile_id=profile.id, name=item.name,
                    instructions=item.instructions, prep_minutes=item.prep_minutes, notes=item.notes, servings=item.servings,
                    total_weight_g=item.total_weight_g, is_favorite=item.is_favorite)
                db.add(recipe); db.flush()
            recipe.name = item.name; recipe.instructions = item.instructions; recipe.prep_minutes = item.prep_minutes; recipe.notes = item.notes
            recipe.servings = item.servings; recipe.total_weight_g = item.total_weight_g; recipe.is_favorite = item.is_favorite
            for ingredient in item.ingredients:
                db.add(RecipeIngredient(id=ingredient.id if db.get(RecipeIngredient, ingredient.id) is None else None, recipe_id=recipe.id,
                    food_id=ingredient.food_id, custom_food_id=custom_id_map.get(ingredient.custom_food_id or "", ingredient.custom_food_id),
                    quantity_g=ingredient.quantity_g, calculated_carbs_g=ingredient.calculated_carbs_g,
                    snapshot=ingredient.snapshot, position=ingredient.position))
            imported_recipes += 1

        for item in request.plans:
            existing = db.scalar(select(MealPlanEntry).where(MealPlanEntry.profile_id == profile.id, MealPlanEntry.id == item.id))
            if existing is not None:
                same = existing.snapshot == item.snapshot and float(existing.quantity) == float(item.quantity) and existing.plan_date == item.plan_date
                if same: skipped_plans += 1; continue
                if not request.overwrite_existing: raise GuestImportError("A meglévő vendég terv eltérő adatot tartalmaz; megerősítés szükséges")
                row = existing
            else:
                row = MealPlanEntry(id=item.id if db.get(MealPlanEntry, item.id) is None else None, profile_id=profile.id)
                db.add(row)
            row.plan_date = item.plan_date; row.meal_category = item.meal_category; row.food_id = item.food_id
            row.custom_food_id = custom_id_map.get(item.custom_food_id or "", item.custom_food_id); row.recipe_id = item.recipe_id
            row.quantity = item.quantity; row.quantity_unit = item.quantity_unit; row.planned_carbs_g = item.planned_carbs_g; row.snapshot = item.snapshot
            imported_plans += 1

        for item in request.shopping:
            existing = db.scalar(select(ShoppingItem).where(ShoppingItem.profile_id == profile.id, ShoppingItem.id == item.id))
            if existing is not None:
                same = existing.name == item.name and existing.quantity == item.quantity and existing.unit == item.unit and existing.checked == item.checked
                if same: skipped_shopping += 1; continue
                if not request.overwrite_existing: raise GuestImportError("A meglévő vendég bevásárlótétel eltérő adatot tartalmaz; megerősítés szükséges")
                row = existing
            else:
                row = ShoppingItem(id=item.id if db.get(ShoppingItem, item.id) is None else None, profile_id=profile.id)
                db.add(row)
            row.name = item.name; row.quantity = item.quantity; row.unit = item.unit; row.checked = item.checked; row.source = item.source
            imported_shopping += 1

        for item in request.meals:
            if item.consumed_at.tzinfo is None or item.consumed_at.utcoffset() is None:
                raise GuestImportError("A vendég bejegyzés időpontjának időzónát kell tartalmaznia")
            snapshot = dict(item.snapshot)
            try:
                carbs_100g = snapshot.get("available_carbs_100g")
                calculated = calculate_carbohydrate(item.amount_g, carbs_100g)
            except (CarbohydrateInputError, TypeError, ValueError) as exc:
                raise GuestImportError("A vendég bejegyzés CH-adata nem számolható") from exc
            key = f"guest:{item.id}"
            existing = db.scalar(select(MealEntry).where(MealEntry.profile_id == profile.id, MealEntry.idempotency_key == key))
            consumed_at = item.consumed_at.astimezone(UTC)
            if existing is not None:
                same = (
                    existing.local_date == item.local_date
                    and Decimal(str(existing.amount_g)) == Decimal(str(item.amount_g))
                    and existing.snapshot == snapshot
                )
                if not same:
                    raise GuestImportError("Azonos vendégazonosító eltérő adatot tartalmaz")
                skipped_meals += 1
                continue
            db.add(
                MealEntry(
                    profile_id=profile.id,
                    food_id=None,
                    consumed_at=consumed_at,
                    local_date=item.local_date,
                    timezone=item.timezone,
                    amount_g=item.amount_g,
                    meal_category=item.meal_category,
                    idempotency_key=key,
                    snapshot=snapshot,
                    calculated_carbs_g=calculated,
                )
            )
            imported_meals += 1

        for item in request.goals:
            if any(key not in CATEGORY_LABELS for key in item.meal_targets):
                raise GuestImportError("Ismeretlen étkezési kategória")
            current = db.scalar(
                select(GoalVersion).where(
                    GoalVersion.profile_id == profile.id,
                    GoalVersion.effective_date == item.effective_date,
                )
            )
            daily_target = float(_target(item.daily_target_g, "napi cél")) if item.daily_target_g is not None else None
            targets = {key: float(_target(value, f"{key} cél")) for key, value in item.meal_targets.items()}
            if current is not None:
                same = (float(current.daily_target_g) if current.daily_target_g is not None else None) == daily_target and (current.meal_targets or {}) == targets
                if same:
                    skipped_goals += 1
                    continue
                if not request.overwrite_existing:
                    raise GuestImportError("A meglévő célverzió eltérő adatot tartalmaz; megerősítés szükséges")
                current.daily_target_g = daily_target
                current.meal_targets = targets
                imported_goals += 1
                continue
            db.add(
                GoalVersion(
                    profile_id=profile.id,
                    effective_date=item.effective_date,
                    daily_target_g=daily_target,
                    meal_targets=targets,
                )
            )
            imported_goals += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    return (imported_meals, skipped_meals, imported_goals, skipped_goals, imported_custom_foods, skipped_custom_foods,
            imported_recipes, skipped_recipes, imported_plans, skipped_plans, imported_shopping, skipped_shopping)
