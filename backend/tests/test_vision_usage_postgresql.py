from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, delete, inspect, select
from sqlalchemy.orm import Session

from app import main
from app.models import VisionUsage


POSTGRES_TEST_URL = os.environ.get("CHILL_TEST_DATABASE_URL", "")
pytestmark = pytest.mark.postgresql


@pytest.mark.skipif(
    not POSTGRES_TEST_URL.startswith(("postgresql", "postgres")),
    reason="CHILL_TEST_DATABASE_URL nincs izolált PostgreSQL test DB-re állítva",
)
def test_vision_usage_is_durable_and_enforces_shared_daily_budget(monkeypatch) -> None:
    if "test" not in POSTGRES_TEST_URL.rsplit("/", 1)[-1].lower():
        pytest.skip("A PostgreSQL cél adatbázis nevében szerepeljen a test jelölés")
    engine = create_engine(POSTGRES_TEST_URL, future=True)
    if not inspect(engine).has_table("vision_usage"):
        pytest.fail("Az 0010_vision_usage Alembic migráció nincs alkalmazva")
    host = "vision-test-client"
    request = SimpleNamespace(client=SimpleNamespace(host=host))
    subject = main._vision_guest_subject(request)
    previous = (main.settings.vision_global_daily_limit, main.settings.vision_daily_limit, main.settings.vision_rate_limit_per_minute)
    monkeypatch.setattr(main.settings, "vision_global_daily_limit", 1)
    monkeypatch.setattr(main.settings, "vision_daily_limit", 10)
    monkeypatch.setattr(main.settings, "vision_rate_limit_per_minute", 10)
    try:
        with Session(engine) as db:
            db.execute(delete(VisionUsage).where(VisionUsage.subject.in_(["all", subject])))
            db.commit()
            main._reserve_postgresql_vision_usage(db, request, None)
            rows = db.scalars(select(VisionUsage).where(VisionUsage.bucket_date == main.datetime.now(main.UTC).date())).all()
            assert {row.scope for row in rows} == {"global", "guest"}
            assert sum(row.daily_count for row in rows if row.scope == "global") == 1
            with pytest.raises(main.VisionLimitExceeded) as error:
                main._reserve_postgresql_vision_usage(db, request, None)
            assert error.value.code == "rate_limit_global"
    finally:
        monkeypatch.setattr(main.settings, "vision_global_daily_limit", previous[0])
        monkeypatch.setattr(main.settings, "vision_daily_limit", previous[1])
        monkeypatch.setattr(main.settings, "vision_rate_limit_per_minute", previous[2])
        with Session(engine) as db:
            db.execute(delete(VisionUsage).where(VisionUsage.subject.in_(["all", subject])))
            db.commit()
        engine.dispose()


@pytest.mark.skipif(
    not POSTGRES_TEST_URL.startswith(("postgresql", "postgres")),
    reason="CHILL_TEST_DATABASE_URL nincs izolált PostgreSQL test DB-re állítva",
)
def test_vision_usage_global_limit_is_atomic_under_parallel_requests(monkeypatch) -> None:
    if "test" not in POSTGRES_TEST_URL.rsplit("/", 1)[-1].lower():
        pytest.skip("A PostgreSQL cél adatbázis nevében szerepeljen a test jelölés")
    engine = create_engine(POSTGRES_TEST_URL, future=True, pool_size=8, max_overflow=0)
    if not inspect(engine).has_table("vision_usage"):
        pytest.fail("Az 0010_vision_usage Alembic migráció nincs alkalmazva")
    previous = (main.settings.vision_global_daily_limit, main.settings.vision_daily_limit, main.settings.vision_rate_limit_per_minute)
    monkeypatch.setattr(main.settings, "vision_global_daily_limit", 3)
    monkeypatch.setattr(main.settings, "vision_daily_limit", 10)
    monkeypatch.setattr(main.settings, "vision_rate_limit_per_minute", 10)
    requests = [SimpleNamespace(client=SimpleNamespace(host=f"vision-concurrent-{index}")) for index in range(10)]
    subjects = [main._vision_guest_subject(request) for request in requests]

    def reserve(request: SimpleNamespace) -> str:
        try:
            with Session(engine) as db:
                main._reserve_postgresql_vision_usage(db, request, None)
            return "ok"
        except main.VisionLimitExceeded as exc:
            return exc.code

    try:
        with Session(engine) as db:
            db.execute(delete(VisionUsage).where(VisionUsage.subject.in_(["all", *subjects])))
            db.commit()
        with ThreadPoolExecutor(max_workers=8) as executor:
            results = list(executor.map(reserve, requests))
        assert results.count("ok") == 3
        assert results.count("rate_limit_global") == 7
        with Session(engine) as db:
            global_row = db.scalar(
                select(VisionUsage).where(
                    VisionUsage.scope == "global",
                    VisionUsage.subject == "all",
                    VisionUsage.bucket_date == main.datetime.now(main.UTC).date(),
                )
            )
            assert global_row is not None
            assert global_row.daily_count == 3
    finally:
        monkeypatch.setattr(main.settings, "vision_global_daily_limit", previous[0])
        monkeypatch.setattr(main.settings, "vision_daily_limit", previous[1])
        monkeypatch.setattr(main.settings, "vision_rate_limit_per_minute", previous[2])
        with Session(engine) as db:
            db.execute(delete(VisionUsage).where(VisionUsage.subject.in_(["all", *subjects])))
            db.commit()
        engine.dispose()
