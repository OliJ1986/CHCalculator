import logging
import hashlib
import hmac
import time
from collections import defaultdict, deque
from datetime import UTC, date, datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .config import get_settings
from .auth import current_user, enforce_same_origin, require_csrf, require_user
from .db import create_tables, get_db
from .domain.carbs import CarbohydrateInputError, calculate_carbohydrate
from .domain.foods import CATEGORY_OTHER, category_label, normalize_query
from .models import Food, User, VisionUsage
from .providers.base import FoodProviderError
from .providers.food_vision import DisabledFoodVisionProvider, FoodVisionError, FoodVisionProvider, GeminiFoodVisionProvider
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
    MealPlanCreateRequest, MealPlanUpdateRequest, MealPlanCopyRequest, MealPlanResponse,
    ShoppingItemCreateRequest, ShoppingItemUpdateRequest, ShoppingItemResponse,
    PlanLogMealRequest,
    FoodVisionResponse, FoodVisionSuggestionResponse, ChefRecipeGenerateRequest, ChefRecipeGenerateResponse, ChefRecipeSuggestionResponse,
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
from .services.planner import PlanError, copy_plan, create_plan, delete_plan, list_plans, log_plan_meal, update_plan
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
food_vision_provider: FoodVisionProvider = GeminiFoodVisionProvider(
    settings.gemini_api_key,
    settings.gemini_model,
    timeout=settings.vision_timeout_seconds,
    max_output_tokens=settings.vision_max_output_tokens,
    recipe_max_output_tokens=settings.vision_recipe_max_output_tokens,
) if settings.vision_enabled and settings.gemini_api_key.strip() else DisabledFoodVisionProvider()
_vision_requests: dict[str, deque[float]] = defaultdict(deque)
_vision_daily: dict[str, tuple[int, int]] = {}


class VisionLimitExceeded(RuntimeError):
    def __init__(self, code: str, message: str, retry_after: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retry_after = retry_after


class VisionQuotaUnavailable(RuntimeError):
    pass


def _vision_rate_key(request: Request, user: User | None) -> str:
    if user is not None:
        return f"user:{user.id}"
    # Do not log or persist this value; it is only an in-process guest bucket.
    return f"guest:{request.client.host if request.client else 'unknown'}"


def _check_vision_limit(key: str) -> None:
    now = time.monotonic()
    window = _vision_requests[key]
    while window and now - window[0] >= 60:
        window.popleft()
    if len(window) >= max(1, settings.vision_rate_limit_per_minute):
        raise HTTPException(status_code=429, detail="A képfelismerési kérési korlátot elérted")
    day = int(time.time() // 86400)
    previous_day, count = _vision_daily.get(key, (day, 0))
    if previous_day != day:
        count = 0
    if settings.vision_daily_limit > 0 and count >= settings.vision_daily_limit:
        raise HTTPException(status_code=429, detail="A napi képfelismerési korlátot elérted")
    window.append(now)
    _vision_daily[key] = (day, count + 1)


def _vision_guest_subject(request: Request) -> str:
    """Use a stable opaque guest subject without trusting forwarded client headers."""
    host = request.client.host if request.client else "unknown"
    salt = settings.staging_proxy_token or "chill-vision-local-salt"
    digest = hmac.new(salt.encode("utf-8"), host.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"guest:{digest}"


def _vision_usage_row(db: Session, bucket_date: date, scope: str, subject: str, now: datetime) -> VisionUsage:
    values = {
        "id": str(uuid4()),
        "bucket_date": bucket_date,
        "scope": scope,
        "subject": subject,
        "minute_started_at": now,
        "minute_count": 0,
        "daily_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    dialect_name = db.get_bind().dialect.name
    if dialect_name == "postgresql":
        db.execute(
            postgresql_insert(VisionUsage)
            .values(**values)
            .on_conflict_do_nothing(index_elements=["bucket_date", "scope", "subject"])
        )
    else:
        existing = db.scalar(
            select(VisionUsage).where(
                VisionUsage.bucket_date == bucket_date,
                VisionUsage.scope == scope,
                VisionUsage.subject == subject,
            )
        )
        if existing is None:
            db.add(VisionUsage(**values))
            db.flush()
    row = db.scalar(
        select(VisionUsage)
        .where(
            VisionUsage.bucket_date == bucket_date,
            VisionUsage.scope == scope,
            VisionUsage.subject == subject,
        )
        .with_for_update()
    )
    if row is None:
        raise VisionQuotaUnavailable("vision usage row was not created")
    return row


def _reserve_postgresql_vision_usage(db: Session, request: Request, user: User | None) -> None:
    """Reserve one request atomically for the client and global daily budget."""
    now = datetime.now(UTC)
    bucket_date = now.date()
    scope = "user" if user is not None else "guest"
    subject = str(user.id) if user is not None else _vision_guest_subject(request)
    # current_user may have left a read transaction open; close it before the
    # short row-locking transaction so the provider call never holds a lock.
    db.commit()
    try:
        global_row = _vision_usage_row(db, bucket_date, "global", "all", now)
        subject_row = _vision_usage_row(db, bucket_date, scope, subject, now)
        if settings.vision_global_daily_limit > 0 and global_row.daily_count >= settings.vision_global_daily_limit:
            raise VisionLimitExceeded("rate_limit_global", "A napi összesített képfelismerési keret elfogyott.", 86400)
        if settings.vision_rate_limit_per_minute > 0:
            elapsed = (now - subject_row.minute_started_at).total_seconds()
            if elapsed >= 60:
                subject_row.minute_started_at = now
                subject_row.minute_count = 0
            if subject_row.minute_count >= settings.vision_rate_limit_per_minute:
                raise VisionLimitExceeded("rate_limit_minute", "A percenkénti képfelismerési korlátot elérted.", 60)
        if settings.vision_daily_limit > 0 and subject_row.daily_count >= settings.vision_daily_limit:
            raise VisionLimitExceeded("rate_limit_daily", "A napi képfelismerési korlátot elérted.", 86400)
        global_row.daily_count += 1
        subject_row.daily_count += 1
        subject_row.minute_count += 1
        global_row.updated_at = now
        subject_row.updated_at = now
        db.commit()
    except VisionLimitExceeded:
        db.rollback()
        raise
    except SQLAlchemyError as exc:
        db.rollback()
        raise VisionQuotaUnavailable("vision usage storage is unavailable") from exc


def _reserve_vision_usage(db: Session, request: Request, user: User | None) -> None:
    if settings.is_postgresql:
        _reserve_postgresql_vision_usage(db, request, user)
    else:
        _check_vision_limit(_vision_rate_key(request, user))


def _vision_http_error(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    principal: str = "unknown",
    mime_type: str | None = None,
    size_bytes: int | None = None,
    retry_after: int | None = None,
) -> HTTPException:
    logger.warning(
        "vision_request_rejected",
        extra={
            "event": "vision_request_rejected",
            "code": code,
            "status_code": status_code,
            "path": request.url.path,
            "principal": principal,
            "mime_type": mime_type or "unknown",
            "size_bytes": size_bytes if size_bytes is not None else -1,
        },
    )
    headers = {"Retry-After": str(retry_after)} if retry_after else None
    return HTTPException(status_code=status_code, detail={"code": code, "message": message}, headers=headers)
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


@app.post("/api/auth/import-guest", response_model=GuestImportResponse, response_model_exclude_defaults=True)
def import_guest(request: Request, payload: GuestImportRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> GuestImportResponse:
    require_csrf(request, db)
    try:
        imported_meals, skipped_meals, imported_goals, skipped_goals, imported_custom_foods, skipped_custom_foods, imported_recipes, skipped_recipes, imported_plans, skipped_plans, imported_shopping, skipped_shopping = import_guest_data(
            db, profile_for_user(db, user), payload
        )
    except GuestImportError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return GuestImportResponse(
        imported_meals=imported_meals,
        skipped_meals=skipped_meals,
        imported_goals=imported_goals,
        skipped_goals=skipped_goals,
        imported_custom_foods=imported_custom_foods,
        skipped_custom_foods=skipped_custom_foods,
        imported_recipes=imported_recipes,
        skipped_recipes=skipped_recipes,
        imported_plans=imported_plans,
        skipped_plans=skipped_plans,
        imported_shopping=imported_shopping,
        skipped_shopping=skipped_shopping,
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


def _food_vision_response(result: object) -> FoodVisionResponse:
    return FoodVisionResponse(
        suggestions=[FoodVisionSuggestionResponse(name=item.name, confidence=item.confidence, possible_ingredients=list(item.possible_ingredients)) for item in result.suggestions],
        uncertain=result.uncertain,
        provider=result.provider,
    )


def _provider_failure(exc: FoodVisionError) -> tuple[int, str, str]:
    if exc.kind == "rate_limit":
        return 429, "provider_rate_limit", "A képfelismerési szolgáltató elérte a korlátját. Próbáld később újra."
    if exc.kind == "timeout":
        return 504, "provider_timeout", "A képfelismerési szolgáltató nem válaszolt időben. Próbáld újra."
    if exc.kind == "network_error":
        return 502, "provider_unavailable", "A képfelismerési szolgáltató nem érhető el."
    if exc.kind == "invalid_response":
        return 502, "provider_invalid_response", "A képfelismerési szolgáltató hibás választ adott."
    if exc.status_code in (401, 403):
        return 502, "provider_authentication", "A képfelismerési szolgáltató hitelesítése sikertelen."
    if exc.status_code == 400:
        return 502, "provider_bad_request", "A képfelismerési kérés nem fogadható el."
    return 502, "provider_error", "A képfelismerési szolgáltató hibát jelzett."


@app.post("/api/vision/food", response_model=FoodVisionResponse)
async def identify_food_from_image(
    request: Request,
    image: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User | None = Depends(current_user),
) -> FoodVisionResponse:
    principal = "registered" if user is not None else "guest"
    if not settings.vision_enabled:
        raise _vision_http_error(request, status_code=503, code="vision_disabled", message="Az AI-ételelemzés jelenleg ki van kapcsolva.", principal=principal)
    if isinstance(food_vision_provider, DisabledFoodVisionProvider) or not settings.gemini_api_key.strip():
        raise _vision_http_error(request, status_code=503, code="vision_unconfigured", message="Az AI-ételelemzés nincs konfigurálva.", principal=principal)
    content_type = (image.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise _vision_http_error(request, status_code=415, code="unsupported_media_type", message="Csak támogatott képfájl tölthető fel.", principal=principal, mime_type=content_type)
    payload = await image.read(settings.vision_max_image_bytes + 1)
    if len(payload) > settings.vision_max_image_bytes:
        raise _vision_http_error(request, status_code=413, code="image_too_large", message="A kép túl nagy.", principal=principal, mime_type=content_type, size_bytes=len(payload))
    try:
        _reserve_vision_usage(db, request, user)
    except VisionLimitExceeded as exc:
        raise _vision_http_error(request, status_code=429, code=exc.code, message=exc.message, principal=principal, mime_type=content_type, size_bytes=len(payload), retry_after=exc.retry_after) from exc
    except VisionQuotaUnavailable as exc:
        logger.error("vision_quota_unavailable", extra={"event": "vision_quota_unavailable", "path": request.url.path, "principal": principal})
        raise _vision_http_error(request, status_code=503, code="rate_limit_unavailable", message="A képfelismerési korlát jelenleg nem ellenőrizhető.", principal=principal, mime_type=content_type, size_bytes=len(payload)) from exc
    try:
        result = await food_vision_provider.identify(payload, content_type)
    except FoodVisionError as exc:
        if exc.kind == "rate_limit":
            status, code, message = 429, "provider_rate_limit", "A képfelismerési szolgáltató elérte a korlátját. Próbáld később újra."
        elif exc.kind == "timeout":
            status, code, message = 504, "provider_timeout", "A képfelismerési szolgáltató nem válaszolt időben. Próbáld újra."
        elif exc.kind == "network_error":
            status, code, message = 502, "provider_unavailable", "A képfelismerési szolgáltató nem érhető el."
        elif exc.kind == "invalid_response":
            status, code, message = 502, "provider_invalid_response", "A képfelismerési szolgáltató hibás választ adott."
        elif exc.status_code in (401, 403):
            status, code, message = 502, "provider_authentication", "A képfelismerési szolgáltató hitelesítése sikertelen."
        elif exc.status_code == 400:
            status, code, message = 502, "provider_bad_request", "A képfelismerési kérés nem fogadható el."
        else:
            status, code, message = 502, "provider_error", "A képfelismerési szolgáltató hibát jelzett."
        logger.warning(
            "vision_provider_failed",
            extra={
                "event": "vision_provider_failed",
                "code": code,
                "provider_kind": exc.kind,
                "provider_status": exc.status_code or 0,
                "mime_type": content_type,
                "size_bytes": len(payload),
                "principal": principal,
            },
        )
        raise _vision_http_error(request, status_code=status, code=code, message=message, principal=principal, mime_type=content_type, size_bytes=len(payload)) from exc
    except Exception as exc:
        logger.error(
            "vision_provider_unhandled",
            extra={"event": "vision_provider_unhandled", "mime_type": content_type, "size_bytes": len(payload), "principal": principal},
        )
        raise _vision_http_error(request, status_code=502, code="provider_error", message="A képfelismerés átmenetileg nem sikerült.", principal=principal, mime_type=content_type, size_bytes=len(payload)) from exc
    return FoodVisionResponse(
        suggestions=[FoodVisionSuggestionResponse(name=item.name, confidence=item.confidence, possible_ingredients=list(item.possible_ingredients)) for item in result.suggestions],
        uncertain=result.uncertain,
        provider=result.provider,
    )


@app.post("/api/vision/fridge", response_model=FoodVisionResponse)
async def identify_fridge_from_images(
    request: Request,
    images: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    user: User | None = Depends(current_user),
) -> FoodVisionResponse:
    principal = "registered" if user is not None else "guest"
    if not settings.vision_enabled:
        raise _vision_http_error(request, status_code=503, code="vision_disabled", message="Az AI-ételelemzés jelenleg ki van kapcsolva.", principal=principal)
    if isinstance(food_vision_provider, DisabledFoodVisionProvider) or not settings.gemini_api_key.strip():
        raise _vision_http_error(request, status_code=503, code="vision_unconfigured", message="Az AI-ételelemzés nincs konfigurálva.", principal=principal)
    if not images or len(images) > settings.vision_max_batch_images:
        raise _vision_http_error(request, status_code=422, code="too_many_images", message=f"Legfeljebb {settings.vision_max_batch_images} hűtőfotó adható meg.", principal=principal)
    payloads: list[tuple[bytes, str]] = []
    total_bytes = 0
    for image in images:
        content_type = (image.content_type or "").lower()
        if not content_type.startswith("image/"):
            raise _vision_http_error(request, status_code=415, code="unsupported_media_type", message="Csak támogatott képfájl tölthető fel.", principal=principal, mime_type=content_type)
        payload = await image.read(settings.vision_max_image_bytes + 1)
        total_bytes += len(payload)
        if len(payload) > settings.vision_max_image_bytes or total_bytes > settings.vision_max_batch_bytes:
            raise _vision_http_error(request, status_code=413, code="image_too_large", message="A hűtőfotók összmérete túl nagy.", principal=principal, mime_type=content_type, size_bytes=total_bytes)
        payloads.append((payload, content_type))
    try:
        _reserve_vision_usage(db, request, user)
    except VisionLimitExceeded as exc:
        raise _vision_http_error(request, status_code=429, code=exc.code, message=exc.message, principal=principal, size_bytes=total_bytes, retry_after=exc.retry_after) from exc
    except VisionQuotaUnavailable as exc:
        logger.error("vision_quota_unavailable", extra={"event": "vision_quota_unavailable", "path": request.url.path, "principal": principal})
        raise _vision_http_error(request, status_code=503, code="rate_limit_unavailable", message="A képfelismerési korlát jelenleg nem ellenőrizhető.", principal=principal, size_bytes=total_bytes) from exc
    try:
        result = await food_vision_provider.identify_many(payloads, mode="fridge")
    except FoodVisionError as exc:
        status, code, message = _provider_failure(exc)
        logger.warning("vision_provider_failed", extra={"event": "vision_provider_failed", "code": code, "provider_kind": exc.kind, "provider_status": exc.status_code or 0, "mime_type": "multipart-images", "size_bytes": total_bytes, "principal": principal})
        raise _vision_http_error(request, status_code=status, code=code, message=message, principal=principal, size_bytes=total_bytes) from exc
    except Exception as exc:
        logger.error("vision_provider_unhandled", extra={"event": "vision_provider_unhandled", "mime_type": "multipart-images", "size_bytes": total_bytes, "principal": principal})
        raise _vision_http_error(request, status_code=502, code="provider_error", message="A képfelismerés átmenetileg nem sikerült.", principal=principal, size_bytes=total_bytes) from exc
    return _food_vision_response(result)


@app.post("/api/chef/recipes/generate", response_model=ChefRecipeGenerateResponse)
async def generate_chef_recipes(
    request: Request,
    payload: ChefRecipeGenerateRequest,
    db: Session = Depends(get_db),
    user: User | None = Depends(current_user),
) -> ChefRecipeGenerateResponse:
    principal = "registered" if user is not None else "guest"
    if not settings.vision_enabled:
        raise _vision_http_error(request, status_code=503, code="vision_disabled", message="Az AI-receptgenerálás jelenleg ki van kapcsolva.", principal=principal)
    if isinstance(food_vision_provider, DisabledFoodVisionProvider) or not settings.gemini_api_key.strip():
        raise _vision_http_error(request, status_code=503, code="vision_unconfigured", message="Az AI-receptgenerálás nincs konfigurálva.", principal=principal)
    ingredients = [value.strip()[:120] for value in payload.ingredients if value.strip()]
    required = [value.strip()[:120] for value in payload.required_ingredients if value.strip()]
    excluded = [value.strip()[:120] for value in payload.excluded_ingredients if value.strip()]
    if not ingredients:
        raise _vision_http_error(request, status_code=422, code="missing_ingredients", message="Legalább egy jóváhagyott alapanyag szükséges.", principal=principal)
    try:
        _reserve_vision_usage(db, request, user)
    except VisionLimitExceeded as exc:
        raise _vision_http_error(request, status_code=429, code=exc.code, message=exc.message, principal=principal, retry_after=exc.retry_after) from exc
    except VisionQuotaUnavailable as exc:
        logger.error("vision_quota_unavailable", extra={"event": "vision_quota_unavailable", "path": request.url.path, "principal": principal})
        raise _vision_http_error(request, status_code=503, code="rate_limit_unavailable", message="A képfelismerési korlát jelenleg nem ellenőrizhető.", principal=principal) from exc
    try:
        result = await food_vision_provider.generate_recipes(
            ingredients=ingredients,
            meal_type=payload.meal_type.strip(),
            servings=payload.servings,
            required=required,
            excluded=excluded,
            carbohydrate_limit_g=payload.carbohydrate_limit_g,
        )
    except FoodVisionError as exc:
        status, code, message = _provider_failure(exc)
        logger.warning("recipe_provider_failed", extra={"event": "recipe_provider_failed", "code": code, "provider_kind": exc.kind, "provider_status": exc.status_code or 0, "principal": principal})
        raise _vision_http_error(request, status_code=status, code=code, message=message, principal=principal) from exc
    except Exception as exc:
        logger.error("recipe_provider_unhandled", extra={"event": "recipe_provider_unhandled", "principal": principal})
        raise _vision_http_error(request, status_code=502, code="provider_error", message="A receptgenerálás átmenetileg nem sikerült.", principal=principal) from exc
    return ChefRecipeGenerateResponse(
        recipes=[ChefRecipeSuggestionResponse(name=item.name, description=item.description, ingredients=list(item.ingredients), missing_ingredients=list(item.missing_ingredients), instructions=list(item.instructions), servings=item.servings, notes=item.notes) for item in result.recipes],
        provider=result.provider,
    )


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


@app.get("/api/plans/summary")
def get_plan_summary(start: date, end: date, db: Session = Depends(get_db), user: User = Depends(require_user)) -> dict:
    if end < start: raise HTTPException(status_code=422, detail="Az időszak vége nem lehet korábbi a kezdeténél")
    rows = list_plans(db, profile_for_user(db, user).id, start, end)
    by_day: dict[str, dict] = {}
    for row in rows:
        day = by_day.setdefault(row.plan_date.isoformat(), {"plan_date": row.plan_date.isoformat(), "planned_carbs_g": 0.0, "categories": {}})
        day["planned_carbs_g"] += row.planned_carbs_g
        day["categories"][row.meal_category] = day["categories"].get(row.meal_category, 0.0) + row.planned_carbs_g
    return {"items": list(by_day.values())}


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


@app.post("/api/plans/{plan_id}/copy", response_model=MealPlanResponse)
def post_plan_copy(request: Request, plan_id: str, payload: MealPlanCopyRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> MealPlanResponse:
    require_csrf(request, db)
    try: return copy_plan(db, profile_for_user(db, user).id, plan_id, payload.target_date)
    except PlanError as exc: raise _catalog_error(exc) from exc


@app.post("/api/plans/{plan_id}/meal", response_model=MealResponse, status_code=201)
def post_plan_meal(request: Request, plan_id: str, payload: PlanLogMealRequest, db: Session = Depends(get_db), user: User = Depends(require_user)) -> MealResponse:
    require_csrf(request, db)
    profile = profile_for_user(db, user)
    try:
        result = log_plan_meal(db, profile.id, plan_id, payload)
    except (PlanError, RecipeError, MealError) as exc:
        raise _catalog_error(exc) from exc
    if isinstance(result, MealResponse): return result
    return MealResponse(id=result.id, food_id=result.food_id, custom_food_id=result.custom_food_id, recipe_id=result.recipe_id,
                        consumed_at=result.consumed_at, local_date=result.local_date, timezone=result.timezone, amount_g=float(result.amount_g),
                        quantity_unit=result.quantity_unit, meal_category=result.meal_category, calculated_carbs_g=float(result.calculated_carbs_g),
                        snapshot=result.snapshot, created_at=result.created_at, updated_at=result.updated_at)


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
