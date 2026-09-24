from datetime import datetime

from pydantic import BaseModel, ConfigDict

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
