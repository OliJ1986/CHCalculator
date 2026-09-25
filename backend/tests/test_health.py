from fastapi.testclient import TestClient

from app import main
from app.config import Settings
from app.main import app

client = TestClient(app)


def test_health_endpoint() -> None:
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_staging_gateway_blocks_default_profile_api(monkeypatch) -> None:
    monkeypatch.setattr(
        main,
        "settings",
        Settings(
            app_env="staging",
            database_url="postgresql+psycopg://user:placeholder@db:5432/chill_staging",
            staging_proxy_token="staging-token",
        ),
    )
    assert client.get("/api/health").status_code == 401
    allowed = client.get("/api/health", headers={"x-chill-staging-gateway": "staging-token"})
    assert allowed.status_code == 200
    assert client.get("/api/ready").status_code in (200, 503)
