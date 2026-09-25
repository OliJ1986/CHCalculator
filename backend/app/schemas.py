from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .domain.foods import CATEGORY_OTHER


class FoodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    original_name: str | None = None
    brand: str | None = None
    barcode: str | None = None
    source: str
    source_id: str
    available_carbs_100g: float | None = None
    serving_size_g: float | None = None
    image_url: str | None = None
    language: str | None = None
    country: str | None = None
    is_generic: bool
    is_verified: bool
    category: str = CATEGORY_OTHER
    category_label: str = "Egyéb"
    created_at: datetime
    updated_at: datetime
    carbs_available: bool


class FoodSearchResponse(BaseModel):
    items: list[FoodResponse]


class CarbohydrateCalculationRequest(BaseModel):
    amount_g: float
    available_carbs_100g: float | None = None


class CarbohydrateCalculationResponse(BaseModel):
    amount_g: float
    available_carbs_100g: float
    carbs_g: float


MealCategory = Literal["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner", "other"]


class MealCreateRequest(BaseModel):
    food_id: str = Field(min_length=1, max_length=36)
    amount_g: float
    consumed_at: datetime | None = None
    local_date: date | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    meal_category: MealCategory = "other"
    idempotency_key: str = Field(min_length=8, max_length=128)
    client_carbs_g: float | None = None


class MealUpdateRequest(BaseModel):
    food_id: str | None = Field(default=None, min_length=1, max_length=36)
    amount_g: float | None = None
    consumed_at: datetime | None = None
    local_date: date | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    meal_category: MealCategory | None = None


class MealResponse(BaseModel):
    id: str
    food_id: str | None
    consumed_at: datetime
    local_date: date
    timezone: str
    amount_g: float
    meal_category: str
    calculated_carbs_g: float
    snapshot: dict
    created_at: datetime
    updated_at: datetime


class MealListResponse(BaseModel):
    items: list[MealResponse]
    total_carbs_g: float


class GoalUpsertRequest(BaseModel):
    effective_date: date
    daily_target_g: float | None = None
    meal_targets: dict[str, float] = Field(default_factory=dict)
    allow_past: bool = False


class GoalResponse(BaseModel):
    local_date: date
    effective_date: date | None
    daily_target_g: float | None
    meal_targets: dict[str, float]
    has_goal: bool


class GoalCategorySummary(BaseModel):
    key: str
    label: str
    consumed_carbs_g: float
    target_g: float | None
    remaining_g: float | None


class GoalSummaryResponse(BaseModel):
    local_date: date
    consumed_carbs_g: float
    daily_target_g: float | None
    remaining_carbs_g: float | None
    progress_ratio: float | None
    progress_percent: float | None
    categories: list[GoalCategorySummary]
