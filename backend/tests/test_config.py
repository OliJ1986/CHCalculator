import pytest

from app.config import BACKEND_DIR, Settings


def test_dev_without_database_url_uses_only_the_legacy_local_cache() -> None:
    settings = Settings(app_env="dev", database_url=None)

    assert settings.is_sqlite is True
    assert settings.effective_database_url == f"sqlite:///{(BACKEND_DIR / 'chill.db').as_posix()}"


def test_prod_without_database_url_fails_clearly() -> None:
    settings = Settings(app_env="prod", database_url=None)

    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        _ = settings.effective_database_url


def test_staging_requires_database_and_proxy_token() -> None:
    with pytest.raises(RuntimeError, match="DATABASE_URL"):
        Settings(app_env="staging", database_url=None, staging_proxy_token="staging-token").validate_runtime()
    with pytest.raises(RuntimeError, match="STAGING_PROXY_TOKEN"):
        Settings(
            app_env="staging",
            database_url="postgresql+psycopg://user:placeholder@db:5432/chill_staging",
        ).validate_runtime()


def test_staging_proxy_token_is_compared_without_exposing_the_value() -> None:
    settings = Settings(
        app_env="staging",
        database_url="postgresql+psycopg://user:placeholder@db:5432/chill_staging",
        staging_proxy_token="staging-token",
    )
    assert settings.staging_token_matches("staging-token") is True
    assert settings.staging_token_matches("wrong-token") is False


def test_explicit_postgresql_url_is_not_replaced_by_sqlite() -> None:
    settings = Settings(
        app_env="test",
        database_url="postgresql+psycopg://user:placeholder@localhost:5432/chill_test",
    )

    assert settings.is_postgresql is True
    assert settings.effective_database_url.startswith("postgresql+psycopg://")
