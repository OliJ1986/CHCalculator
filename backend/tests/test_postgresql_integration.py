from __future__ import annotations

import os

import pytest

from app.config import get_settings
from app.tools.cache_import import import_sqlite_cache
from tests.test_cache_import import _make_database

POSTGRES_TEST_URL = os.environ.get("CHILL_TEST_DATABASE_URL", "")
pytestmark = pytest.mark.postgresql


@pytest.mark.skipif(
    not POSTGRES_TEST_URL.startswith(("postgresql", "postgres")),
    reason="CHILL_TEST_DATABASE_URL nincs izolált PostgreSQL test DB-re állítva",
)
def test_cache_import_against_real_postgresql(tmp_path) -> None:
    if "test" not in POSTGRES_TEST_URL.rsplit("/", 1)[-1].lower():
        pytest.skip("A PostgreSQL cél adatbázis nevében szerepeljen a test jelölés")
    from alembic.command import upgrade
    from alembic.config import Config

    os.environ["APP_ENV"] = "test"
    os.environ["DATABASE_URL"] = POSTGRES_TEST_URL
    get_settings.cache_clear()
    upgrade(Config("alembic.ini"), "head")
    source_path = tmp_path / "source.sqlite"
    _make_database(source_path).dispose()
    report = import_sqlite_cache(
        source_path=source_path,
        target_url=POSTGRES_TEST_URL,
        environment="test",
        dry_run=True,
    )
    assert report.source_rows == 2
