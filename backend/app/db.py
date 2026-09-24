from collections.abc import Generator

from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import Session, sessionmaker

from .config import get_settings
from .domain.aliases import display_usda_name
from .domain.usda import (
    DIETARY_FIBER_NUTRIENT_ID,
    TOTAL_CARBOHYDRATE_NUTRIENT_ID,
    USDA_MAPPING_VERSION,
    categorize_usda_food,
)
from .models import Base, Food

settings = get_settings()
connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}
engine = create_engine(settings.database_url, connect_args=connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def migrate_usda_cache(db: Session) -> int:
    """Refresh only stale USDA presentation metadata; never delete food rows."""
    rows = list(db.scalars(select(Food).where(Food.source == "usda")))
    changed = 0
    for food in rows:
        payload = dict(food.source_payload) if isinstance(food.source_payload, dict) else {}
        if payload.get("mapping_version") == USDA_MAPPING_VERSION:
            continue
        source_name = payload.get("description") or food.original_name or food.name
        if not isinstance(source_name, str) or not source_name.strip():
            continue
        source_name = source_name.strip()
        food.name = display_usda_name(source_name)
        food.original_name = source_name
        food.category = categorize_usda_food(
            {
                "dataType": payload.get("data_type"),
                "foodCategory": payload.get("food_category"),
            },
            source_name,
        )
        payload["mapping_version"] = USDA_MAPPING_VERSION
        payload.setdefault(
            "nutrient_ids",
            {
                "total_carbohydrate": TOTAL_CARBOHYDRATE_NUTRIENT_ID,
                "dietary_fiber": DIETARY_FIBER_NUTRIENT_ID,
            },
        )
        payload.setdefault(
            "nutrient_values",
            {
                str(TOTAL_CARBOHYDRATE_NUTRIENT_ID): payload.get("total_carbohydrate_100g"),
                str(DIETARY_FIBER_NUTRIENT_ID): payload.get("dietary_fiber_100g"),
            },
        )
        food.source_payload = payload
        changed += 1
    if changed:
        db.commit()
    return changed


def create_tables() -> None:
    Base.metadata.create_all(bind=engine)
    # The project uses a small SQLite cache without a migration dependency yet.
    # Additive columns keep an existing development cache usable after upgrades.
    if settings.database_url.startswith("sqlite"):
        existing = {column["name"] for column in inspect(engine).get_columns("foods")}
        with engine.begin() as connection:
            if "original_name" not in existing:
                connection.execute(text("ALTER TABLE foods ADD COLUMN original_name VARCHAR(300)"))
                connection.execute(text("UPDATE foods SET original_name = name WHERE original_name IS NULL"))
            if "category" not in existing:
                connection.execute(
                    text("ALTER TABLE foods ADD COLUMN category VARCHAR(32) NOT NULL DEFAULT 'other'")
                )
    with SessionLocal() as db:
        migrate_usda_cache(db)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
