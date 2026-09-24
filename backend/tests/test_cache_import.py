from __future__ import annotations

import hashlib
from datetime import UTC, datetime

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.models import Base, Food
from app.tools.cache_import import CacheImportError, ImportConflictError, import_sqlite_cache


def _make_database(path, *, changed: bool = False):
    engine = create_engine(f"sqlite:///{path}", future=True)
    Base.metadata.create_all(engine)
    now = datetime(2026, 9, 24, 12, 0, tzinfo=UTC)
    with Session(engine) as db:
        db.add_all(
            [
                Food(
                    id="food-1",
                    name="Alma",
                    original_name="Apple, raw",
                    normalized_name="alma apple raw",
                    source="usda",
                    source_id="1001",
                    available_carbs_100g=11.4 if not changed else 99.0,
                    serving_size_g=None,
                    language=None,
                    country=None,
                    is_generic=True,
                    is_verified=False,
                    category="ingredient",
                    source_payload={
                        "description": "Apple, raw",
                        "data_type": "Foundation",
                        "mapping_version": 4,
                        "nutrient_ids": {"total_carbohydrate": 1005, "dietary_fiber": 1079},
                        "nutrient_values": {"1005": 13.8, "1079": 2.4},
                    },
                    created_at=now,
                    updated_at=now,
                ),
                Food(
                    id="food-2",
                    name="Null CH",
                    original_name="Missing nutrient",
                    normalized_name="null ch",
                    source="open_food_facts",
                    source_id="off-1",
                    available_carbs_100g=None,
                    serving_size_g=0,
                    is_generic=False,
                    is_verified=False,
                    category="other",
                    source_payload={"nutriments": {"carbohydrates_100g": None}},
                    created_at=now,
                    updated_at=now,
                ),
            ]
        )
        db.commit()
    return engine


def _make_empty_database(path):
    engine = create_engine(f"sqlite:///{path}", future=True)
    Base.metadata.create_all(engine)
    engine.dispose()


def test_cache_import_dry_run_write_and_idempotence(tmp_path) -> None:
    source_path = tmp_path / "source.sqlite"
    target_path = tmp_path / "target.sqlite"
    _make_database(source_path)
    _make_empty_database(target_path)
    before_hash = hashlib.sha256(source_path.read_bytes()).hexdigest()

    dry = import_sqlite_cache(
        source_path=source_path,
        target_url=f"sqlite:///{target_path}",
        environment="test",
        dry_run=True,
        allow_non_postgresql_target=True,
    )
    assert dry.dry_run is True
    assert dry.source_rows == 2
    assert dry.candidate_insert_rows == 2
    with Session(create_engine(f"sqlite:///{target_path}")) as db:
        assert db.scalar(select(Food).where(Food.source_id == "1001")) is None

    written = import_sqlite_cache(
        source_path=source_path,
        target_url=f"sqlite:///{target_path}",
        environment="test",
        dry_run=False,
        backup_path=tmp_path / "source.backup.sqlite",
        allow_non_postgresql_target=True,
    )
    assert written.inserted_rows == 2
    repeated = import_sqlite_cache(
        source_path=source_path,
        target_url=f"sqlite:///{target_path}",
        environment="test",
        dry_run=False,
        backup_path=tmp_path / "source.backup.sqlite",
        allow_non_postgresql_target=True,
    )
    assert repeated.inserted_rows == 0
    assert repeated.identical_rows == 2
    assert hashlib.sha256(source_path.read_bytes()).hexdigest() == before_hash


def test_cache_import_conflict_rolls_back_without_overwrite(tmp_path) -> None:
    source_path = tmp_path / "source.sqlite"
    target_path = tmp_path / "target.sqlite"
    _make_database(source_path)
    _make_database(target_path, changed=True).dispose()

    with pytest.raises(ImportConflictError) as error:
        import_sqlite_cache(
            source_path=source_path,
            target_url=f"sqlite:///{target_path}",
            environment="test",
            dry_run=False,
            allow_non_postgresql_target=True,
        )

    assert error.value.conflicts == [("usda", "1001")]
    with Session(create_engine(f"sqlite:///{target_path}")) as db:
        rows = list(db.scalars(select(Food).order_by(Food.source_id)))
        assert len(rows) == 2
        assert rows[0].available_carbs_100g == 99.0


def test_cache_import_rejects_prod_and_non_postgresql_targets(tmp_path) -> None:
    source_path = tmp_path / "source.sqlite"
    _make_database(source_path).dispose()

    with pytest.raises(CacheImportError, match="prod"):
        import_sqlite_cache(
            source_path=source_path,
            target_url="postgresql+psycopg://placeholder",
            environment="prod",
        )
    with pytest.raises(CacheImportError, match="PostgreSQL"):
        import_sqlite_cache(
            source_path=source_path,
            target_url="sqlite:///target.sqlite",
            environment="test",
        )
