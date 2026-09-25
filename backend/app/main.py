import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .config import get_settings
from .auth import current_user, enforce_same_origin, require_csrf, require_user
from .db import create_tables, get_db
from .domain.carbs import CarbohydrateInputError, calculate_carbohydrate
from .domain.foods import CATEGORY_OTHER, category_label, normalize_query
from .models import Food, User
from .providers.base import FoodProviderError
from .providers.open_food_facts import OpenFoodFactsProvider
from .providers.usda import USDAProvider
from .schemas import (
    CarbohydrateCalculationRequest,
    CarbohydrateCalculationResponse,
    FoodResponse,
    FoodSearchResponse,
    GoalResponse,
    GoalSummaryResponse,
    GoalUpsertRequest,
    MealCreateRequest,
    MealListResponse,
    MealResponse,
    MealUpdateRequest,
    AuthResponse,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyEmailRequest,
    GuestImportRequest,
    GuestImportResponse,
    CustomFoodCreateRequest, CustomFoodUpdateRequest, CustomFoodResponse,
    RecipeCreateRequest, RecipeResponse, RecipeMealRequest,
    MealPlanCreateRequest, MealPlanUpdateRequest, MealPlanResponse,
    ShoppingItemCreateRequest, ShoppingItemUpdateRequest, ShoppingItemResponse,
)
from .services.foods import FoodService
from .services.meals import (
    DEFAULT_TIMEZONE,
    MealConflictError,
    MealError,
    MealNotFoundError,
    create_meal,
    delete_meal,
    list_meals,
    update_meal,
)
from .services.goals import GoalError, goal_response, summary as goal_summary, upsert_goal
from .services.auth import (
    AccountNotVerified,
    AuthError,
    InvalidCredentials,
    LoginRateLimited,
    authenticate,
    create_password_reset,
    create_session,
    create_user,
    hash_password,
    profile_for_user,
    reset_password,
    revoke_all_sessions,
    revoke_session,
    validate_password,
    verify_email,
)
from .services.guest_import import GuestImportError, import_guest_data
from .services.custom_foods import CustomFoodError, create_custom_food, delete_custom_food, list_custom_foods, toggle_favorite as toggle_custom_food_favorite, update_custom_food
from .services.recipes import RecipeError, create_recipe, delete_recipe, get_recipe_response, list_recipes, log_recipe_meal, toggle_recipe_favorite, update_recipe
from .services.planner import PlanError, create_plan, delete_plan, list_plans, update_plan
from .services.shopping import ShoppingError, create_item, delete_item, generate_from_plans, list_items, update_item

logger = logging.getLogger(__name__)
settings = get_settings()
settings.validate_runtime()
logger.info("USDA configured: %s", bool(settings.usda_api_key.strip()))
app = FastAPI(title=settings.app_name, version="0.1.0")
food_service = FoodService(
    OpenFoodFactsProvider(),
    USDAProvider(settings.usda_api_key, base_url=settings.usda_base_url),
)
create_tables()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_staging_gateway(request, call_next):
    """Keep the default-profile API unusable if a staging service is exposed accidentally."""
    if request.url.path == "/api/ready" or settings.staging_token_matches(
        request.headers.get("x-chill-staging-gateway")
    ):
        return await call_next(request)
    return JSONResponse(status_code=401, content={"detail": "Staging gateway authentication required"})


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/ready")
def ready(db: Session = Depends(get_db)) -> dict[str, str]:
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=503, detail="Database is not ready") from exc
    return {"status": "ok"}


@app.post("/api/carbs/calculate", response_model=CarbohydrateCalculationResponse)
def calculate_carbs(payload: CarbohydrateCalculationRequest) -> CarbohydrateCalculationResponse:
    try:
        carbs = calculate_carbohydrate(payload.amount_g, payload.available_carbs_100g)
    except CarbohydrateInputError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return CarbohydrateCalculationResponse(
        amount_g=payload.amount_g,
        available_carbs_100g=payload.available_carbs_100g,
        carbs_g=carbs,
    )


def _set_auth_cookies(response: Response, session_token: str, csrf_token: str) -> None:
    secure = settings.app_env in ("staging", "prod")
    response.set_cookie(
        settings.auth_cookie_name,
        session_token,
        httponly=True,
        secure=secure,
        samesite="lax",
        max_age=settings.auth_session_ttl_hours * 3600,
        path="/",
    )
    response.set_cookie(
        settings.auth_csrf_cookie_name,
        csrf_token,
        httponly=False,
        secure=secure,
        samesite="lax",
        max_age=settings.auth_session_ttl_hours * 3600,
        path="/",
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(settings.auth_cookie_name, path="/")
    response.delete_cookie(settings.auth_csrf_cookie_name, path="/")


@app.post("/api/auth/register", response_model=AuthResponse, status_code=202)
def register(request: Request, payload: RegisterRequest, db: Session = Depends(get_db)) -> AuthResponse:
    enforce_same_origin(request)
    try:
        user, verification_token = create_user(db, payload.email, payload.password, settings)
    except AuthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    # The response is intentionally generic for existing addresses. In local
    # test/dev mode a token is returned so the email-delivery adapter can be
    # exercised without a real provider; staging/prod never expose it.
    return AuthResponse(
        status="verification_required",
        verification_token=verification_token if settings.app_env in ("dev", "test") else None,
        email=user.email if user is not None and settings.app_env in ("dev", "test") else None,
    )


@app.post("/api/auth/verify-email", response_model=AuthResponse)
def verify_registered_email(request: Request, payload: VerifyEmailRequest, db: Session = Depends(get_db)) -> AuthResponse:
    enforce_same_origin(request)
    user = verify_email(db, payload.token)
    if user is None:
        raise HTTPException(status_code=400, detail="A megerősítő hivatkozás érvénytelen vagy lejárt")
    return AuthResponse(status="verified", authenticated=False, role="registered", email=user.email, email_verified=True)


@app.post("/api/auth/login", response_model=AuthResponse)
def login(request: Request, response: Response, payload: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    enforce_same_origin(request)
    ip = request.client.host if request.client else None
    try:
        user = authenticate(db, payload.email, payload.password, ip)
    except LoginRateLimited as exc:
        raise HTTPException(status_code=429, detail=str(exc), headers={"Retry-After": "900"}) from exc
    except AccountNotVerified as exc:
        # Keep unverified and unknown accounts indistinguishable to callers.
        raise HTTPException(status_code=401, detail="Hibás email vagy jelszó") from exc
    except (InvalidCredentials, AuthError) as exc:
        raise HTTPException(status_code=401, detail="Hibás email vagy jelszó") from exc
    _session, raw, csrf = create_session(db, user, settings)
    _set_auth_cookies(response, raw, csrf)
    return AuthResponse(status="authenticated", authenticated=True, role=user.role, email=user.email, email_verified=True, csrf_token=csrf)


@app.get("/api/auth/me", response_model=AuthResponse)
def me(user: User | None = Depends(current_user)) -> AuthResponse:
    if user is None:
        return AuthResponse(status="guest", authenticated=False)
    return AuthResponse(status="authenticated", authenticated=True, role=user.role, email=user.email, email_verified=user.email_verified_at is not None)


@app.post("/api/auth/logout", response_model=AuthResponse)
def logout(request: Request, response: Response, db: Session = Depends(get_db)) -> AuthResponse:
    raw = request.cookies.get(settings.auth_cookie_name)
    if raw:
        require_csrf(request, db)
        revoke_session(db, raw)
    _clear_auth_cookies(response)
    return AuthResponse(status="logged_out")


@app.post("/api/auth/forgot-password", response_model=AuthResponse, status_code=202)
def forgot_password(request: Request, payload: ForgotPasswordRequest, db: Session = Depends(get_db)) -> AuthResponse:
    enforce_same_origin(request)
    try:
        token = create_password_reset(db, payload.email, settings)
    except AuthError:
        token = None
    return AuthResponse(
        status="reset_requested",
        reset_token=token if settings.app_env in ("dev", "test") else None,
    )


@app.post("/api/auth/reset-password", response_model=AuthResponse)
def reset_registered_password(request: Request, payload: ResetPasswordRequest, db: Session = Depends(get_db)) -> AuthResponse:
    enforce_same_origin(request)
    try:
        success = reset_password(db, payload.token, payload.password)
    except AuthError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if not success:
        raise HTTPException(status_code=400, detail="A jelszó-visszaállító hivatkozás érvénytelen vagy lejárt")
    return AuthResponse(status="password_reset")


@app.post("/api/auth/change-password", response_model=AuthResponse)
def change_password(request: Request, response: Response, payload: ChangePasswordRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> AuthResponse:
    require_csrf(request, db)
    ip = request.client.host if request.client else None
    try:
        authenticate(db, user.email, payload.current_password, ip)
        validate_password(payload.new_password)
    except (AuthError, InvalidCredentials) as exc:
        raise HTTPException(status_code=422 if not isinstance(exc, InvalidCredentials) else 401, detail=str(exc)) from exc
    user.password_hash = hash_password(payload.new_password)
    revoke_all_sessions(db, user.id)
    _session, raw, csrf = create_session(db, user, settings)
    _set_auth_cookies(response, raw, csrf)
    return AuthResponse(status="password_changed", authenticated=True, role=user.role, email=user.email, email_verified=True, csrf_token=csrf)


@app.post("/api/auth/import-guest", response_model=GuestImportResponse)
def import_guest(request: Request, payload: GuestImportRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> GuestImportResponse:
    require_csrf(request, db)
    try:
        imported_meals, skipped_meals, imported_goals, skipped_goals = import_guest_data(
            db, profile_for_user(db, user), payload
        )
    except GuestImportError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return GuestImportResponse(
        imported_meals=imported_meals,
        skipped_meals=skipped_meals,
        imported_goals=imported_goals,
        skipped_goals=skipped_goals,
    )


def _meal_error(exc: MealError) -> HTTPException:
    if isinstance(exc, MealNotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    if isinstance(exc, MealConflictError):
        return HTTPException(status_code=409, detail=str(exc))
    return HTTPException(status_code=422, detail=str(exc))


def _goal_error(exc: GoalError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@app.get("/api/meals", response_model=MealListResponse)
def get_meals(
    local_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> MealListResponse:
    target_date = local_date or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    try:
        items, total = list_meals(db, target_date, profile_for_user(db, user).id)
    except MealError as exc:
        raise _meal_error(exc) from exc
    return MealListResponse(items=items, total_carbs_g=total)


@app.post("/api/meals", response_model=MealResponse, status_code=201)
def post_meal(request: Request, payload: MealCreateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> MealResponse:
    require_csrf(request, db)
    try:
        return create_meal(db, payload, profile_for_user(db, user).id)
    except MealError as exc:
        raise _meal_error(exc) from exc


@app.patch("/api/meals/{meal_id}", response_model=MealResponse)
def patch_meal(request: Request, meal_id: str, payload: MealUpdateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> MealResponse:
    require_csrf(request, db)
    try:
        return update_meal(db, meal_id, payload, profile_for_user(db, user).id)
    except MealError as exc:
        raise _meal_error(exc) from exc


@app.delete("/api/meals/{meal_id}", status_code=204)
def remove_meal(request: Request, meal_id: str, db: Session = Depends(get_db), user: User = Depends(require_user)) -> None:
    require_csrf(request, db)
    try:
        delete_meal(db, meal_id, profile_for_user(db, user).id)
    except MealError as exc:
        raise _meal_error(exc) from exc


@app.get("/api/goals", response_model=GoalResponse)
def get_goals(
    local_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> GoalResponse:
    target_date = local_date or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    try:
        return goal_response(db, target_date, profile_for_user(db, user).id)
    except GoalError as exc:
        raise _goal_error(exc) from exc


@app.put("/api/goals", response_model=GoalResponse)
def put_goal(request: Request, payload: GoalUpsertRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> GoalResponse:
    require_csrf(request, db)
    try:
        return upsert_goal(db, payload, profile_for_user(db, user).id)
    except GoalError as exc:
        raise _goal_error(exc) from exc


@app.get("/api/goals/summary", response_model=GoalSummaryResponse)
def get_goal_summary(
    local_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(require_user),
) -> GoalSummaryResponse:
    target_date = local_date or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    try:
        return goal_summary(db, target_date, profile_for_user(db, user).id)
    except GoalError as exc:
        raise _goal_error(exc) from exc


def _food_response(food: Food) -> FoodResponse:
    return FoodResponse(
        id=food.id,
        name=food.name,
        original_name=food.original_name or food.name,
        brand=food.brand,
        barcode=food.barcode,
        source=food.source,
        source_id=food.source_id,
        available_carbs_100g=food.available_carbs_100g,
        serving_size_g=food.serving_size_g,
        image_url=food.image_url,
        language=food.language,
        country=food.country,
        is_generic=food.is_generic,
        is_verified=food.is_verified,
        category=food.category or CATEGORY_OTHER,
        category_label=category_label(food.category),
        created_at=food.created_at,
        updated_at=food.updated_at,
        carbs_available=food.available_carbs_100g is not None,
    )


@app.get("/api/foods/search", response_model=FoodSearchResponse)
async def search_foods(
    q: str = Query(min_length=2, max_length=120),
    db: Session = Depends(get_db),
) -> FoodSearchResponse:
    if len(normalize_query(q)) < 2:
        raise HTTPException(status_code=422, detail="A kereséshez legalább 2 nem üres karakter szükséges")
    try:
        foods = await food_service.search(db, q, limit=20)
    except FoodProviderError as exc:
        raise HTTPException(status_code=503, detail="Az ételkeresés átmenetileg nem elérhető") from exc
    return FoodSearchResponse(items=[_food_response(food) for food in foods])


@app.get("/api/foods/barcode/{barcode}", response_model=FoodResponse | None)
async def get_food_by_barcode(barcode: str, db: Session = Depends(get_db)) -> FoodResponse | None:
    try:
        food = await food_service.get_by_barcode(db, barcode)
    except FoodProviderError as exc:
        raise HTTPException(status_code=503, detail="A vonalkódos ételkeresés átmenetileg nem elérhető") from exc
    return _food_response(food) if food else None


def _catalog_error(exc: ValueError) -> HTTPException:
    return HTTPException(status_code=422, detail=str(exc))


@app.get("/api/custom-foods", response_model=list[CustomFoodResponse])
def get_custom_foods(q: str | None = Query(default=None, max_length=120), favorites: bool = False,
                     db: Session = Depends(get_db), user: User = Depends(require_user)) -> list[CustomFoodResponse]:
    return list_custom_foods(db, profile_for_user(db, user).id, q, favorites)


@app.post("/api/custom-foods", response_model=CustomFoodResponse, status_code=201)
def post_custom_food(request: Request, payload: CustomFoodCreateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> CustomFoodResponse:
    require_csrf(request, db)
    try: return create_custom_food(db, profile_for_user(db, user).id, payload)
    except CustomFoodError as exc: raise _catalog_error(exc) from exc


@app.patch("/api/custom-foods/{food_id}", response_model=CustomFoodResponse)
def patch_custom_food(request: Request, food_id: str, payload: CustomFoodUpdateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> CustomFoodResponse:
    require_csrf(request, db)
    try: return update_custom_food(db, profile_for_user(db, user).id, food_id, payload)
    except CustomFoodError as exc: raise _catalog_error(exc) from exc


@app.delete("/api/custom-foods/{food_id}", status_code=204)
def remove_custom_food(request: Request, food_id: str, db: Session = Depends(get_db), user: User = Depends(require_user)) -> None:
    require_csrf(request, db)
    try: delete_custom_food(db, profile_for_user(db, user).id, food_id)
    except CustomFoodError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/custom-foods/{food_id}/favorite", response_model=CustomFoodResponse)
def favorite_custom_food(request: Request, food_id: str, db: Session = Depends(get_db), user: User = Depends(require_user)) -> CustomFoodResponse:
    require_csrf(request, db)
    try: return toggle_custom_food_favorite(db, profile_for_user(db, user).id, food_id)
    except CustomFoodError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/recipes", response_model=list[RecipeResponse])
def get_recipes(db: Session = Depends(get_db), user: User = Depends(require_user)) -> list[RecipeResponse]:
    return list_recipes(db, profile_for_user(db, user).id)


@app.get("/api/recipes/{recipe_id}", response_model=RecipeResponse)
def get_one_recipe(recipe_id: str, db: Session = Depends(get_db), user: User = Depends(require_user)) -> RecipeResponse:
    try: return get_recipe_response(db, profile_for_user(db, user).id, recipe_id)
    except RecipeError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/recipes", response_model=RecipeResponse, status_code=201)
def post_recipe(request: Request, payload: RecipeCreateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> RecipeResponse:
    require_csrf(request, db)
    try: return create_recipe(db, profile_for_user(db, user).id, payload)
    except RecipeError as exc: raise _catalog_error(exc) from exc


@app.put("/api/recipes/{recipe_id}", response_model=RecipeResponse)
def put_recipe(request: Request, recipe_id: str, payload: RecipeCreateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> RecipeResponse:
    require_csrf(request, db)
    try: return update_recipe(db, profile_for_user(db, user).id, recipe_id, payload)
    except RecipeError as exc: raise _catalog_error(exc) from exc


@app.delete("/api/recipes/{recipe_id}", status_code=204)
def remove_recipe(request: Request, recipe_id: str, db: Session = Depends(get_db), user: User = Depends(require_user)) -> None:
    require_csrf(request, db)
    try: delete_recipe(db, profile_for_user(db, user).id, recipe_id)
    except RecipeError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/recipes/{recipe_id}/favorite", response_model=RecipeResponse)
def favorite_recipe(request: Request, recipe_id: str, db: Session = Depends(get_db), user: User = Depends(require_user)) -> RecipeResponse:
    require_csrf(request, db)
    try: return toggle_recipe_favorite(db, profile_for_user(db, user).id, recipe_id)
    except RecipeError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/recipes/{recipe_id}/meal", response_model=MealResponse, status_code=201)
def post_recipe_meal(request: Request, recipe_id: str, payload: RecipeMealRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> MealResponse:
    require_csrf(request, db)
    profile = profile_for_user(db, user)
    try:
        entry = log_recipe_meal(db, profile.id, recipe_id, payload, payload.timezone or profile.timezone)
    except RecipeError as exc: raise _catalog_error(exc) from exc
    return MealResponse(id=entry.id, food_id=None, custom_food_id=None, recipe_id=entry.recipe_id, consumed_at=entry.consumed_at,
                        local_date=entry.local_date, timezone=entry.timezone, amount_g=float(entry.amount_g), quantity_unit=entry.quantity_unit,
                        meal_category=entry.meal_category, calculated_carbs_g=float(entry.calculated_carbs_g), snapshot=entry.snapshot,
                        created_at=entry.created_at, updated_at=entry.updated_at)


@app.get("/api/plans", response_model=list[MealPlanResponse])
def get_plans(start: date | None = Query(default=None), end: date | None = Query(default=None), db: Session = Depends(get_db), user: User = Depends(require_user)) -> list[MealPlanResponse]:
    return list_plans(db, profile_for_user(db, user).id, start, end)


@app.post("/api/plans", response_model=MealPlanResponse, status_code=201)
def post_plan(request: Request, payload: MealPlanCreateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> MealPlanResponse:
    require_csrf(request, db)
    try: return create_plan(db, profile_for_user(db, user).id, payload)
    except PlanError as exc: raise _catalog_error(exc) from exc


@app.patch("/api/plans/{plan_id}", response_model=MealPlanResponse)
def patch_plan(request: Request, plan_id: str, payload: MealPlanUpdateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> MealPlanResponse:
    require_csrf(request, db)
    try: return update_plan(db, profile_for_user(db, user).id, plan_id, payload)
    except PlanError as exc: raise _catalog_error(exc) from exc


@app.delete("/api/plans/{plan_id}", status_code=204)
def remove_plan(request: Request, plan_id: str, db: Session = Depends(get_db), user: User = Depends(require_user)) -> None:
    require_csrf(request, db)
    try: delete_plan(db, profile_for_user(db, user).id, plan_id)
    except PlanError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/shopping-list", response_model=list[ShoppingItemResponse])
def get_shopping_list(db: Session = Depends(get_db), user: User = Depends(require_user)) -> list[ShoppingItemResponse]:
    return list_items(db, profile_for_user(db, user).id)


@app.post("/api/shopping-list", response_model=ShoppingItemResponse, status_code=201)
def post_shopping_item(request: Request, payload: ShoppingItemCreateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> ShoppingItemResponse:
    require_csrf(request, db); return create_item(db, profile_for_user(db, user).id, payload)


@app.patch("/api/shopping-list/{item_id}", response_model=ShoppingItemResponse)
def patch_shopping_item(request: Request, item_id: str, payload: ShoppingItemUpdateRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> ShoppingItemResponse:
    require_csrf(request, db)
    try: return update_item(db, profile_for_user(db, user).id, item_id, payload)
    except ShoppingError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/shopping-list/{item_id}", status_code=204)
def remove_shopping_item(request: Request, item_id: str, db: Session = Depends(get_db), user: User = Depends(require_user)) -> None:
    require_csrf(request, db)
    try: delete_item(db, profile_for_user(db, user).id, item_id)
    except ShoppingError as exc: raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/shopping-list/generate", response_model=list[ShoppingItemResponse])
def post_generate_shopping(request: Request, start: date, end: date, db: Session = Depends(get_db), user: User = Depends(require_user)) -> list[ShoppingItemResponse]:
    require_csrf(request, db)
    if end < start: raise HTTPException(status_code=422, detail="Az időszak vége nem lehet korábbi a kezdeténél")
    return generate_from_plans(db, profile_for_user(db, user).id, start, end)
