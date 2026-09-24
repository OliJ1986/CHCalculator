import logging

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from .config import get_settings
from .db import create_tables, get_db
from .domain.foods import CATEGORY_OTHER, category_label, normalize_query
from .models import Food
from .providers.base import FoodProviderError
from .providers.open_food_facts import OpenFoodFactsProvider
from .providers.usda import USDAProvider
from .schemas import FoodResponse, FoodSearchResponse
from .services.foods import FoodService

logger = logging.getLogger(__name__)
settings = get_settings()
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
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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
