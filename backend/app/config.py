from functools import lru_cache
from pathlib import Path
from secrets import compare_digest
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    app_name: str = "CHill API"
    app_env: Literal["dev", "test", "staging", "prod"] = "dev"
    database_url: str | None = None
    cors_origins: str = ""
    usda_api_key: str = ""
    usda_base_url: str = "https://api.nal.usda.gov/fdc/v1"
    staging_proxy_token: str = ""
    auth_session_ttl_hours: int = 720
    auth_verification_ttl_hours: int = 24
    auth_reset_ttl_minutes: int = 30
    auth_cookie_name: str = "chill_session"
    auth_csrf_cookie_name: str = "chill_csrf"
    auth_email_delivery_url: str = ""

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def effective_database_url(self) -> str:
        if self.database_url and self.database_url.strip():
            return self.database_url.strip()
        if self.app_env in ("staging", "prod"):
            raise RuntimeError("DATABASE_URL kötelező staging/prod környezetben")
        # A meglévő fejlesztési cache csak explicit, lokális dev/test fallback.
        return f"sqlite:///{(BACKEND_DIR / 'chill.db').as_posix()}"

    @property
    def is_sqlite(self) -> bool:
        return self.effective_database_url.startswith("sqlite")

    @property
    def is_postgresql(self) -> bool:
        return self.effective_database_url.startswith(("postgresql", "postgres"))

    def validate_runtime(self) -> None:
        """Fail closed for deployable environments before the app serves requests."""
        _ = self.effective_database_url
        if self.app_env == "staging" and not self.staging_proxy_token.strip():
            raise RuntimeError("STAGING_PROXY_TOKEN kötelező staging környezetben")

    def staging_token_matches(self, provided: str | None) -> bool:
        return self.app_env != "staging" or bool(
            provided and self.staging_proxy_token and compare_digest(provided, self.staging_proxy_token)
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
