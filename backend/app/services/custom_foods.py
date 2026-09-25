from __future__ import annotations

import math
from sqlalchemy import select, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..domain.carbs import CarbohydrateInputError, validate_available_carbs_100g
from ..models import CustomFood
from ..schemas import CustomFoodCreateRequest, CustomFoodResponse, CustomFoodUpdateRequest


class CustomFoodError(ValueError):
    pass


def _valid_number(value: float | None, field: str, *, positive: bool = False) -> float | None:
    if value is None:
        return None
    if not math.isfinite(value) or (positive and value <= 0) or (not positive and value < 0):
        raise CustomFoodError(f"Érvénytelen {field}")
    return float(value)


def _response(row: CustomFood) -> CustomFoodResponse:
    return CustomFoodResponse(
        id=row.id, name=row.name, brand=row.brand,
        available_carbs_100g=float(row.available_carbs_100g),
        dietary_fiber_100g=float(row.dietary_fiber_100g) if row.dietary_fiber_100g is not None else None,
        serving_size_g=float(row.serving_size_g) if row.serving_size_g is not None else None,
        notes=row.notes, is_favorite=row.is_favorite,
        created_at=row.created_at, updated_at=row.updated_at,
    )


def _validate_payload(payload: CustomFoodCreateRequest | CustomFoodUpdateRequest, *, required: bool) -> None:
    if required or payload.available_carbs_100g is not None:
        try:
            validate_available_carbs_100g(payload.available_carbs_100g)
        except (CarbohydrateInputError, TypeError, ValueError) as exc:
            raise CustomFoodError("A CH/100 g értéknek 0 és 100 közötti véges számnak kell lennie") from exc
    _valid_number(payload.dietary_fiber_100g, "dietary_fiber_100g")
    _valid_number(payload.serving_size_g, "serving_size_g", positive=True)


def list_custom_foods(db: Session, profile_id: str, query: str | None = None, favorites_only: bool = False) -> list[CustomFoodResponse]:
    statement = select(CustomFood).where(CustomFood.profile_id == profile_id).order_by(CustomFood.is_favorite.desc(), CustomFood.name.asc())
    if query and query.strip():
        token = f"%{query.strip().lower()}%"
        statement = statement.where(or_(CustomFood.name.ilike(token), CustomFood.brand.ilike(token)))
    if favorites_only:
        statement = statement.where(CustomFood.is_favorite.is_(True))
    return [_response(row) for row in db.scalars(statement)]


def create_custom_food(db: Session, profile_id: str, payload: CustomFoodCreateRequest) -> CustomFoodResponse:
    _validate_payload(payload, required=True)
    row = CustomFood(profile_id=profile_id, name=payload.name.strip(), brand=payload.brand.strip() if payload.brand else None,
                     available_carbs_100g=validate_available_carbs_100g(payload.available_carbs_100g),
                     dietary_fiber_100g=payload.dietary_fiber_100g, serving_size_g=payload.serving_size_g,
                     notes=payload.notes, is_favorite=payload.is_favorite)
    db.add(row)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CustomFoodError("Már létezik ilyen saját étel") from exc
    db.refresh(row)
    return _response(row)


def get_custom_food(db: Session, profile_id: str, food_id: str) -> CustomFood:
    row = db.scalar(select(CustomFood).where(CustomFood.id == food_id, CustomFood.profile_id == profile_id))
    if row is None:
        raise CustomFoodError("A saját étel nem található")
    return row


def update_custom_food(db: Session, profile_id: str, food_id: str, payload: CustomFoodUpdateRequest) -> CustomFoodResponse:
    row = get_custom_food(db, profile_id, food_id)
    _validate_payload(payload, required=False)
    for field in ("name", "brand", "available_carbs_100g", "dietary_fiber_100g", "serving_size_g", "notes", "is_favorite"):
        value = getattr(payload, field)
        if value is not None:
            setattr(row, field, value.strip() if field in ("name", "brand") and isinstance(value, str) else value)
    if payload.available_carbs_100g is not None:
        row.available_carbs_100g = validate_available_carbs_100g(payload.available_carbs_100g)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CustomFoodError("Már létezik ilyen saját étel") from exc
    db.refresh(row)
    return _response(row)


def delete_custom_food(db: Session, profile_id: str, food_id: str) -> None:
    row = get_custom_food(db, profile_id, food_id)
    db.delete(row)
    db.commit()


def toggle_favorite(db: Session, profile_id: str, food_id: str) -> CustomFoodResponse:
    row = get_custom_food(db, profile_id, food_id)
    row.is_favorite = not row.is_favorite
    db.commit()
    db.refresh(row)
    return _response(row)
