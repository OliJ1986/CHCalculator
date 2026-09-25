import logging
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .config import get_settings
from .db import create_tables, get_db
from .domain.carbs import CarbohydrateInputError, calculate_carbohydrate
from .domain.foods import CATEGORY_OTHER, category_label, normalize_query
from .models import Food
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
) -> MealListResponse:
    target_date = local_date or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    try:
        items, total = list_meals(db, target_date)
    except MealError as exc:
        raise _meal_error(exc) from exc
    return MealListResponse(items=items, total_carbs_g=total)


@app.post("/api/meals", response_model=MealResponse, status_code=201)
def post_meal(payload: MealCreateRequest, db: Session = Depends(get_db)) -> MealResponse:
    try:
        return create_meal(db, payload)
    except MealError as exc:
        raise _meal_error(exc) from exc


@app.patch("/api/meals/{meal_id}", response_model=MealResponse)
def patch_meal(meal_id: str, payload: MealUpdateRequest, db: Session = Depends(get_db)) -> MealResponse:
    try:
        return update_meal(db, meal_id, payload)
    except MealError as exc:
        raise _meal_error(exc) from exc


@app.delete("/api/meals/{meal_id}", status_code=204)
def remove_meal(meal_id: str, db: Session = Depends(get_db)) -> None:
    try:
        delete_meal(db, meal_id)
    except MealError as exc:
        raise _meal_error(exc) from exc


@app.get("/api/goals", response_model=GoalResponse)
def get_goals(
    local_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> GoalResponse:
    target_date = local_date or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    try:
        return goal_response(db, target_date)
    except GoalError as exc:
        raise _goal_error(exc) from exc


@app.put("/api/goals", response_model=GoalResponse)
def put_goal(payload: GoalUpsertRequest, db: Session = Depends(get_db)) -> GoalResponse:
    try:
        return upsert_goal(db, payload)
    except GoalError as exc:
        raise _goal_error(exc) from exc


@app.get("/api/goals/summary", response_model=GoalSummaryResponse)
def get_goal_summary(
    local_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
) -> GoalSummaryResponse:
    target_date = local_date or datetime.now(ZoneInfo(DEFAULT_TIMEZONE)).date()
    try:
        return goal_summary(db, target_date)
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
