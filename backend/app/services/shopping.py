from __future__ import annotations

from datetime import date
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import MealPlanEntry, ShoppingItem
from ..schemas import ShoppingItemCreateRequest, ShoppingItemResponse, ShoppingItemUpdateRequest


class ShoppingError(ValueError):
    pass


def _response(row: ShoppingItem) -> ShoppingItemResponse:
    return ShoppingItemResponse(id=row.id, name=row.name, quantity=row.quantity, unit=row.unit, checked=row.checked,
                                source=row.source, created_at=row.created_at, updated_at=row.updated_at)


def list_items(db: Session, profile_id: str) -> list[ShoppingItemResponse]:
    return [_response(row) for row in db.scalars(select(ShoppingItem).where(ShoppingItem.profile_id == profile_id).order_by(ShoppingItem.checked, ShoppingItem.name))]


def create_item(db: Session, profile_id: str, payload: ShoppingItemCreateRequest, source: str = "manual") -> ShoppingItemResponse:
    row = ShoppingItem(profile_id=profile_id, name=payload.name.strip(), quantity=payload.quantity, unit=payload.unit, checked=payload.checked, source=source)
    db.add(row); db.commit(); db.refresh(row); return _response(row)


def get_item(db: Session, profile_id: str, item_id: str) -> ShoppingItem:
    row = db.scalar(select(ShoppingItem).where(ShoppingItem.id == item_id, ShoppingItem.profile_id == profile_id))
    if row is None: raise ShoppingError("A bevásárlólista-tétel nem található")
    return row


def update_item(db: Session, profile_id: str, item_id: str, payload: ShoppingItemUpdateRequest) -> ShoppingItemResponse:
    row = get_item(db, profile_id, item_id)
    for field in ("name", "quantity", "unit", "checked"):
        value = getattr(payload, field)
        if value is not None: setattr(row, field, value.strip() if field == "name" else value)
    db.commit(); db.refresh(row); return _response(row)


def delete_item(db: Session, profile_id: str, item_id: str) -> None:
    db.delete(get_item(db, profile_id, item_id)); db.commit()


def generate_from_plans(db: Session, profile_id: str, start: date, end: date) -> list[ShoppingItemResponse]:
    plans = list(db.scalars(select(MealPlanEntry).where(MealPlanEntry.profile_id == profile_id, MealPlanEntry.plan_date >= start, MealPlanEntry.plan_date <= end)))
    grouped: dict[tuple[str, str], float] = {}
    for plan in plans:
        if plan.recipe_id and isinstance(plan.snapshot.get("ingredients"), list):
            for ingredient in plan.snapshot["ingredients"]:
                name = str(ingredient.get("name") or "Hozzávaló"); qty = float(ingredient.get("quantity_g") or 0)
                grouped[(name, "g")] = grouped.get((name, "g"), 0) + qty
        else:
            name = str(plan.snapshot.get("name") or "Élelmiszer")
            unit = "g" if plan.quantity_unit == "g" else "adag"
            grouped[(name, unit)] = grouped.get((name, unit), 0) + float(plan.quantity)
    for (name, unit), quantity in grouped.items():
        existing = db.scalar(select(ShoppingItem).where(ShoppingItem.profile_id == profile_id, ShoppingItem.name == name, ShoppingItem.unit == unit, ShoppingItem.source == "planner"))
        if existing: existing.quantity = (existing.quantity or 0) + quantity; existing.checked = False
        else: db.add(ShoppingItem(profile_id=profile_id, name=name, quantity=quantity, unit=unit, source="planner", checked=False))
    db.commit(); return list_items(db, profile_id)
