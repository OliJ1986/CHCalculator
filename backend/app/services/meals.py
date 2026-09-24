from __future__ import annotations

from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..domain.carbs import CarbohydrateInputError, validate_amount_g, validate_available_carbs_100g
from ..models import Food, MealEntry, Profile
from ..schemas import MealCreateRequest, MealResponse, MealUpdateRequest

DEFAULT_PROFILE_ID = "default-profile"
DEFAULT_TIMEZONE = "Europe/Budapest"
SNAPSHOT_VERSION = 1
CALCULATION_VERSION = "m2-v1"


class MealError(ValueError):
    pass


class MealNotFoundError(MealError):
    pass


class MealConflictError(MealError):
    pass


def get_default_profile(db: Session) -> Profile:
    profile = db.get(Profile, DEFAULT_PROFILE_ID)
    if profile is not None:
        return profile
    profile = Profile(id=DEFAULT_PROFILE_ID, timezone=DEFAULT_TIMEZONE)
    db.add(profile)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        profile = db.get(Profile, DEFAULT_PROFILE_ID)
        if profile is None:
            raise
        return profile
    db.refresh(profile)
    return profile


def _timezone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise MealError("Érvénytelen IANA időzóna") from exc


def _utc_datetime(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(UTC)
    if value.tzinfo is None or value.utcoffset() is None:
        raise MealError("Az időpontnak explicit UTC-eltolást kell tartalmaznia")
    return value.astimezone(UTC)


def _decimal(value: object, *, field: str) -> Decimal:
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise MealError(f"Érvénytelen {field}") from exc
    if not result.is_finite():
        raise MealError(f"Érvénytelen {field}")
    return result


def _snapshot(food: Food, captured_at: datetime) -> dict:
    payload = dict(food.source_payload) if isinstance(food.source_payload, dict) else {}
    return {
        "snapshot_version": SNAPSHOT_VERSION,
        "captured_at": captured_at.isoformat(),
        "calculation_version": CALCULATION_VERSION,
        "unit": "g",
        "name": food.name,
        "original_name": food.original_name or food.name,
        "brand": food.brand,
        "source": food.source,
        "source_id": food.source_id,
        "available_carbs_100g": float(food.available_carbs_100g) if food.available_carbs_100g is not None else None,
        "total_carbohydrate_100g": payload.get("total_carbohydrate_100g"),
        "dietary_fiber_100g": payload.get("dietary_fiber_100g"),
        "nutrient_ids": payload.get("nutrient_ids"),
        "nutrient_values": payload.get("nutrient_values"),
        "nutrient_provenance": payload.get("nutrient_provenance"),
        "mapping_version": payload.get("mapping_version"),
    }


def _calculated(amount: Decimal, carbs_100g: object) -> Decimal:
    try:
        carbs = _decimal(validate_available_carbs_100g(float(carbs_100g)), field="available_carbs_100g")
    except (CarbohydrateInputError, TypeError, ValueError) as exc:
        raise MealError("A kiválasztott étel CH-adata nem számolható") from exc
    return amount * carbs / Decimal("100")


def _validate_amount(value: object) -> Decimal:
    try:
        numeric = validate_amount_g(float(value))
    except (CarbohydrateInputError, TypeError, ValueError) as exc:
        raise MealError("A mennyiségnek 0-nál nagyobb, véges számnak kell lennie") from exc
    return _decimal(numeric, field="amount_g")


def _meal_response(entry: MealEntry) -> MealResponse:
    return MealResponse(
        id=entry.id,
        food_id=entry.food_id,
        consumed_at=entry.consumed_at,
        local_date=entry.local_date,
        timezone=entry.timezone,
        amount_g=float(entry.amount_g),
        meal_category=entry.meal_category,
        calculated_carbs_g=float(entry.calculated_carbs_g),
        snapshot=entry.snapshot,
        created_at=entry.created_at,
        updated_at=entry.updated_at,
    )


def create_meal(db: Session, request: MealCreateRequest) -> MealResponse:
    profile = get_default_profile(db)
    amount = _validate_amount(request.amount_g)
    zone_name = request.timezone or profile.timezone
    zone = _timezone(zone_name)
    consumed_at = _utc_datetime(request.consumed_at)
    local_date = request.local_date or consumed_at.astimezone(zone).date()
    food = db.get(Food, request.food_id)
    if food is None:
        raise MealError("A kiválasztott étel nem található")
    if food.available_carbs_100g is None:
        raise MealError("A kiválasztott étel CH-adata nem számolható")
    existing = db.scalar(
        select(MealEntry).where(
            MealEntry.profile_id == profile.id,
            MealEntry.idempotency_key == request.idempotency_key,
        )
    )
    if existing is not None:
        if existing.food_id != food.id or Decimal(str(existing.amount_g)) != amount:
            raise MealConflictError("Az idempotencia-kulcs már más bejegyzéshez tartozik")
        return _meal_response(existing)
    calculated = _calculated(amount, food.available_carbs_100g)
    if request.client_carbs_g is not None and abs(float(calculated) - request.client_carbs_g) > 1e-9:
        raise MealError("A kliens által küldött CH-érték eltér a szerver számításától")
    now = datetime.now(UTC)
    entry = MealEntry(
        profile_id=profile.id,
        food_id=food.id,
        consumed_at=consumed_at,
        local_date=local_date,
        timezone=zone_name,
        amount_g=amount,
        meal_category=request.meal_category,
        idempotency_key=request.idempotency_key,
        snapshot=_snapshot(food, now),
        calculated_carbs_g=calculated,
    )
    db.add(entry)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise MealConflictError("Az idempotencia-kulcs már más bejegyzéshez tartozik") from exc
    db.refresh(entry)
    return _meal_response(entry)


def list_meals(db: Session, local_date: date) -> tuple[list[MealResponse], float]:
    profile = get_default_profile(db)
    entries = list(
        db.scalars(
            select(MealEntry)
            .where(MealEntry.profile_id == profile.id, MealEntry.local_date == local_date)
            .order_by(MealEntry.consumed_at, MealEntry.created_at)
        )
    )
    total = sum((Decimal(str(entry.calculated_carbs_g)) for entry in entries), Decimal("0"))
    return [_meal_response(entry) for entry in entries], float(total)


def update_meal(db: Session, meal_id: str, request: MealUpdateRequest) -> MealResponse:
    profile = get_default_profile(db)
    entry = db.scalar(select(MealEntry).where(MealEntry.id == meal_id, MealEntry.profile_id == profile.id))
    if entry is None:
        raise MealNotFoundError("A bejegyzés nem található")
    amount = _validate_amount(request.amount_g) if request.amount_g is not None else _decimal(entry.amount_g, field="amount_g")
    food = db.get(Food, request.food_id) if request.food_id is not None else (db.get(Food, entry.food_id) if entry.food_id else None)
    food_changed = request.food_id is not None and request.food_id != entry.food_id
    if food_changed:
        if food is None or food.available_carbs_100g is None:
            raise MealError("Az új étel CH-adata nem számolható")
        entry.food_id = food.id
        entry.snapshot = _snapshot(food, datetime.now(UTC))
    snapshot_carbs = entry.snapshot.get("available_carbs_100g") if isinstance(entry.snapshot, dict) else None
    calculated = _calculated(amount, snapshot_carbs)
    zone_name = request.timezone or entry.timezone
    zone = _timezone(zone_name)
    consumed_at = _utc_datetime(request.consumed_at) if request.consumed_at is not None else entry.consumed_at
    entry.amount_g = amount
    entry.calculated_carbs_g = calculated
    entry.consumed_at = consumed_at
    entry.timezone = zone_name
    # A changed instant is interpreted in the entry's (or explicitly supplied)
    # IANA zone.  Preserve a previously pinned day only when the instant and
    # timezone were not edited; this keeps explicit historical day overrides
    # intact while making time edits cross midnight correctly.
    if request.local_date is not None:
        entry.local_date = request.local_date
    elif request.consumed_at is not None or request.timezone is not None:
        entry.local_date = consumed_at.astimezone(zone).date()
    if request.meal_category is not None:
        entry.meal_category = request.meal_category
    db.commit()
    db.refresh(entry)
    return _meal_response(entry)


def delete_meal(db: Session, meal_id: str) -> None:
    profile = get_default_profile(db)
    entry = db.scalar(select(MealEntry).where(MealEntry.id == meal_id, MealEntry.profile_id == profile.id))
    if entry is None:
        raise MealNotFoundError("A bejegyzés nem található")
    db.delete(entry)
    db.commit()
