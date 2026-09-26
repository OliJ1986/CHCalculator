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
    food_id: str | None = Field(default=None, min_length=1, max_length=36)
    custom_food_id: str | None = Field(default=None, min_length=1, max_length=36)
    amount_g: float
    consumed_at: datetime | None = None
    local_date: date | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    meal_category: MealCategory = "other"
    idempotency_key: str = Field(min_length=8, max_length=128)
    client_carbs_g: float | None = None
    quantity_unit: Literal["g"] = "g"


class MealUpdateRequest(BaseModel):
    food_id: str | None = Field(default=None, min_length=1, max_length=36)
    custom_food_id: str | None = Field(default=None, min_length=1, max_length=36)
    amount_g: float | None = None
    consumed_at: datetime | None = None
    local_date: date | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    meal_category: MealCategory | None = None


class MealResponse(BaseModel):
    id: str
    food_id: str | None
    custom_food_id: str | None = None
    recipe_id: str | None = None
    consumed_at: datetime
    local_date: date
    timezone: str
    amount_g: float
    meal_category: str
    quantity_unit: str = "g"
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


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512)


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=512)
    password: str = Field(min_length=12, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)


class AuthResponse(BaseModel):
    status: str
    authenticated: bool = False
    role: str = "guest"
    email: str | None = None
    email_verified: bool = False
    verification_token: str | None = None
    reset_token: str | None = None
    csrf_token: str | None = None


class GuestMealImport(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    consumed_at: datetime
    local_date: date
    timezone: str = Field(min_length=1, max_length=64)
    amount_g: float
    meal_category: MealCategory = "other"
    snapshot: dict


class GuestGoalImport(BaseModel):
    effective_date: date
    daily_target_g: float | None = None
    meal_targets: dict[str, float] = Field(default_factory=dict)
    allow_past: bool = True


class GuestCustomFoodImport(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=200)
    available_carbs_100g: float
    dietary_fiber_100g: float | None = None
    serving_size_g: float | None = None
    notes: str | None = Field(default=None, max_length=4000)
    is_favorite: bool = False


class GuestRecipeIngredientImport(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    food_id: str | None = None
    custom_food_id: str | None = None
    quantity_g: float
    calculated_carbs_g: float
    snapshot: dict
    position: int = 0


class GuestRecipeImport(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=200)
    instructions: str | None = None
    prep_minutes: int | None = None
    notes: str | None = None
    servings: float
    total_weight_g: float | None = None
    is_favorite: bool = False
    ingredients: list[GuestRecipeIngredientImport] = Field(min_length=1, max_length=200)


class GuestPlanImport(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    plan_date: date
    meal_category: MealCategory = "other"
    food_id: str | None = None
    custom_food_id: str | None = None
    recipe_id: str | None = None
    quantity: float
    quantity_unit: Literal["g", "servings"] = "g"
    planned_carbs_g: float
    snapshot: dict


class GuestShoppingImport(BaseModel):
    id: str = Field(min_length=1, max_length=128)
    name: str = Field(min_length=1, max_length=200)
    quantity: float | None = None
    unit: Literal["g", "ml", "db", "adag"] = "db"
    checked: bool = False
    source: str = "manual"


class GuestImportRequest(BaseModel):
    meals: list[GuestMealImport] = Field(default_factory=list, max_length=2000)
    goals: list[GuestGoalImport] = Field(default_factory=list, max_length=500)
    custom_foods: list[GuestCustomFoodImport] = Field(default_factory=list, max_length=1000)
    recipes: list[GuestRecipeImport] = Field(default_factory=list, max_length=500)
    plans: list[GuestPlanImport] = Field(default_factory=list, max_length=2000)
    shopping: list[GuestShoppingImport] = Field(default_factory=list, max_length=2000)
    overwrite_existing: bool = False


class GuestImportResponse(BaseModel):
    imported_meals: int
    skipped_meals: int
    imported_goals: int
    skipped_goals: int
    imported_custom_foods: int = 0
    skipped_custom_foods: int = 0
    imported_recipes: int = 0
    skipped_recipes: int = 0
    imported_plans: int = 0
    skipped_plans: int = 0
    imported_shopping: int = 0
    skipped_shopping: int = 0


class CustomFoodCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=200)
    available_carbs_100g: float
    dietary_fiber_100g: float | None = None
    serving_size_g: float | None = None
    notes: str | None = Field(default=None, max_length=4000)
    is_favorite: bool = False


class CustomFoodUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    brand: str | None = Field(default=None, max_length=200)
    available_carbs_100g: float | None = None
    dietary_fiber_100g: float | None = None
    serving_size_g: float | None = None
    notes: str | None = Field(default=None, max_length=4000)
    is_favorite: bool | None = None


class CustomFoodResponse(BaseModel):
    id: str
    name: str
    brand: str | None
    available_carbs_100g: float
    dietary_fiber_100g: float | None
    serving_size_g: float | None
    notes: str | None
    is_favorite: bool
    created_at: datetime
    updated_at: datetime


class RecipeIngredientRequest(BaseModel):
    food_id: str | None = Field(default=None, min_length=1, max_length=36)
    custom_food_id: str | None = Field(default=None, min_length=1, max_length=36)
    quantity_g: float


class RecipeCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    servings: float = Field(gt=0)
    total_weight_g: float | None = Field(default=None, gt=0)
    instructions: str | None = Field(default=None, max_length=10000)
    prep_minutes: int | None = Field(default=None, ge=0, le=10080)
    notes: str | None = Field(default=None, max_length=4000)
    is_favorite: bool = False
    ingredients: list[RecipeIngredientRequest] = Field(min_length=1, max_length=200)


class RecipeUpdateRequest(RecipeCreateRequest):
    pass


class RecipeIngredientResponse(BaseModel):
    id: str
    food_id: str | None
    custom_food_id: str | None
    quantity_g: float
    calculated_carbs_g: float
    snapshot: dict
    position: int


class RecipeResponse(BaseModel):
    id: str
    name: str
    instructions: str | None
    prep_minutes: int | None
    notes: str | None
    servings: float
    total_weight_g: float | None
    total_carbs_g: float
    carbs_per_serving_g: float
    carbs_per_100g_cooked_g: float | None
    is_favorite: bool
    ingredients: list[RecipeIngredientResponse]
    created_at: datetime
    updated_at: datetime


class RecipeMealRequest(BaseModel):
    quantity: float = Field(gt=0)
    quantity_unit: Literal["g", "servings"] = "servings"
    local_date: date | None = None
    meal_category: MealCategory = "other"
    timezone: str | None = Field(default=None, min_length=1, max_length=64)
    idempotency_key: str = Field(min_length=8, max_length=128)


class MealPlanCreateRequest(BaseModel):
    plan_date: date
    meal_category: MealCategory = "other"
    food_id: str | None = Field(default=None, min_length=1, max_length=36)
    custom_food_id: str | None = Field(default=None, min_length=1, max_length=36)
    recipe_id: str | None = Field(default=None, min_length=1, max_length=36)
    quantity: float = Field(gt=0)
    quantity_unit: Literal["g", "servings"] = "g"


class MealPlanUpdateRequest(BaseModel):
    plan_date: date | None = None
    meal_category: MealCategory | None = None
    quantity: float | None = Field(default=None, gt=0)
    quantity_unit: Literal["g", "servings"] | None = None


class MealPlanCopyRequest(BaseModel):
    target_date: date


class MealPlanResponse(BaseModel):
    id: str
    plan_date: date
    meal_category: str
    food_id: str | None
    custom_food_id: str | None
    recipe_id: str | None
    quantity: float
    quantity_unit: str
    planned_carbs_g: float
    snapshot: dict
    created_at: datetime
    updated_at: datetime


class PlanLogMealRequest(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=128)
    consumed_at: datetime | None = None
    local_date: date | None = None
    timezone: str | None = Field(default=None, min_length=1, max_length=64)


class ShoppingItemCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    quantity: float | None = Field(default=None, ge=0)
    unit: Literal["g", "ml", "db", "adag"] = "db"
    checked: bool = False


class ShoppingItemUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    quantity: float | None = Field(default=None, ge=0)
    unit: Literal["g", "ml", "db", "adag"] | None = None
    checked: bool | None = None


class ShoppingItemResponse(BaseModel):
    id: str
    name: str
    quantity: float | None
    unit: str
    checked: bool
    source: str
    created_at: datetime
    updated_at: datetime


class FoodVisionSuggestionResponse(BaseModel):
    name: str
    confidence: float | None = None
    possible_ingredients: list[str] = Field(default_factory=list)


class FoodVisionResponse(BaseModel):
    suggestions: list[FoodVisionSuggestionResponse] = Field(default_factory=list)
    uncertain: bool = True
    provider: str
