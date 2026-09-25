from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..domain.carbs import CarbohydrateInputError, validate_amount_g
from ..models import GoalVersion, MealEntry, Profile
from ..schemas import (
    GoalCategorySummary,
    GoalResponse,
    GoalSummaryResponse,
    GoalUpsertRequest,
)
from .meals import DEFAULT_TIMEZONE, get_default_profile

CATEGORY_LABELS = {
    "breakfast": "Reggeli",
    "morning_snack": "Tízórai",
    "lunch": "Ebéd",
    "afternoon_snack": "Uzsonna",
    "dinner": "Vacsora",
    "other": "Egyéb",
}


class GoalError(ValueError):
    pass


def _target(value: object, field: str) -> Decimal:
    try:
        number = validate_amount_g(float(value))
        result = Decimal(str(number))
    except (CarbohydrateInputError, TypeError, ValueError, InvalidOperation) as exc:
        raise GoalError(f"A {field} értékének 0-nál nagyobb, véges számnak kell lennie") from exc
    if not result.is_finite():
        raise GoalError(f"A {field} értékének 0-nál nagyobb, véges számnak kell lennie")
    return result


def _values(goal: GoalVersion | None) -> tuple[float | None, dict[str, float]]:
    if goal is None:
        return None, {}
    daily = float(goal.daily_target_g) if goal.daily_target_g is not None else None
    targets = goal.meal_targets if isinstance(goal.meal_targets, dict) else {}
    return daily, {key: float(value) for key, value in targets.items()}


def get_goal_for_date(db: Session, local_date: date, profile_id: str | None = None) -> GoalVersion | None:
    profile = get_default_profile(db) if profile_id is None else db.get(Profile, profile_id)
    if profile is None:
        raise GoalError("A profil nem található")
    return db.scalar(
        select(GoalVersion)
        .where(GoalVersion.profile_id == profile.id, GoalVersion.effective_date <= local_date)
        .order_by(GoalVersion.effective_date.desc(), GoalVersion.created_at.desc())
        .limit(1)
    )


def goal_response(db: Session, local_date: date, profile_id: str | None = None) -> GoalResponse:
    goal = get_goal_for_date(db, local_date, profile_id)
    daily, targets = _values(goal)
    has_goal = goal is not None and (daily is not None or bool(targets))
    return GoalResponse(
        local_date=local_date,
        effective_date=goal.effective_date if goal else None,
        daily_target_g=daily,
        meal_targets=targets,
        has_goal=has_goal,
    )


def upsert_goal(db: Session, request: GoalUpsertRequest, profile_id: str | None = None) -> GoalResponse:
    today = datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    if request.effective_date < today and not request.allow_past:
        raise GoalError("Múltbeli hatályhoz explicit megerősítés szükséges")
    daily = _target(request.daily_target_g, "napi cél") if request.daily_target_g is not None else None
    targets: dict[str, float] = {}
    for key, value in request.meal_targets.items():
        if key not in CATEGORY_LABELS:
            raise GoalError("Ismeretlen étkezési kategória")
        targets[key] = float(_target(value, f"{key} cél"))
    profile = get_default_profile(db) if profile_id is None else db.get(Profile, profile_id)
    if profile is None:
        raise GoalError("A profil nem található")
    goal = db.scalar(
        select(GoalVersion).where(
            GoalVersion.profile_id == profile.id,
            GoalVersion.effective_date == request.effective_date,
        )
    )
    if goal is None:
        goal = GoalVersion(profile_id=profile.id, effective_date=request.effective_date)
        db.add(goal)
    goal.daily_target_g = daily
    goal.meal_targets = targets
    db.commit()
    db.refresh(goal)
    return goal_response(db, request.effective_date, profile.id)


def summary(db: Session, local_date: date, profile_id: str | None = None) -> GoalSummaryResponse:
    goal = get_goal_for_date(db, local_date, profile_id)
    daily_target, targets = _values(goal)
    profile = get_default_profile(db) if profile_id is None else db.get(Profile, profile_id)
    if profile is None:
        raise GoalError("A profil nem található")
    entries = list(
        db.scalars(
            select(MealEntry).where(
                MealEntry.profile_id == profile.id,
                MealEntry.local_date == local_date,
            )
        )
    )
    consumed = sum((Decimal(str(entry.calculated_carbs_g)) for entry in entries), Decimal("0"))
    categories: list[GoalCategorySummary] = []
    for key, label in CATEGORY_LABELS.items():
        category_total = sum(
            (Decimal(str(entry.calculated_carbs_g)) for entry in entries if entry.meal_category == key),
            Decimal("0"),
        )
        category_target = Decimal(str(targets[key])) if key in targets else None
        categories.append(
            GoalCategorySummary(
                key=key,
                label=label,
                consumed_carbs_g=float(category_total),
                target_g=float(category_target) if category_target is not None else None,
                remaining_g=float(category_target - category_total) if category_target is not None else None,
            )
        )
    daily = Decimal(str(daily_target)) if daily_target is not None else None
    ratio = consumed / daily if daily is not None else None
    return GoalSummaryResponse(
        local_date=local_date,
        consumed_carbs_g=float(consumed),
        daily_target_g=daily_target,
        remaining_carbs_g=float(daily - consumed) if daily is not None else None,
        progress_ratio=float(ratio) if ratio is not None else None,
        progress_percent=min(float(ratio * Decimal("100")), 100.0) if ratio is not None else None,
        categories=categories,
    )
