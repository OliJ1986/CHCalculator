from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..domain.carbs import CarbohydrateInputError, calculate_carbohydrate
from ..models import CustomFood, GoalVersion, MealEntry, Profile
from ..domain.carbs import validate_available_carbs_100g
from ..schemas import GuestImportRequest
from .goals import CATEGORY_LABELS, _target


class GuestImportError(ValueError):
    pass


def import_guest_data(db: Session, profile: Profile, request: GuestImportRequest) -> tuple[int, int, int, int, int, int]:
    imported_meals = skipped_meals = imported_goals = skipped_goals = 0
    imported_custom_foods = skipped_custom_foods = 0
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
                    skipped_custom_foods += 1
                    continue
                if not request.overwrite_existing:
                    raise GuestImportError("A meglévő saját étel eltérő adatot tartalmaz; megerősítés szükséges")
                current.available_carbs_100g = carbs; current.dietary_fiber_100g = item.dietary_fiber_100g; current.serving_size_g = item.serving_size_g; current.notes = item.notes; current.is_favorite = item.is_favorite
                imported_custom_foods += 1
                continue
            db.add(CustomFood(profile_id=profile.id, name=item.name.strip(), brand=brand, available_carbs_100g=carbs,
                              dietary_fiber_100g=item.dietary_fiber_100g, serving_size_g=item.serving_size_g, notes=item.notes, is_favorite=item.is_favorite))
            imported_custom_foods += 1

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
    return imported_meals, skipped_meals, imported_goals, skipped_goals, imported_custom_foods, skipped_custom_foods
