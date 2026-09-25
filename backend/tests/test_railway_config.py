from pathlib import Path
import tomllib


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def load_config(path: str) -> dict:
    with (REPOSITORY_ROOT / path).open("rb") as config_file:
        return tomllib.load(config_file)


def test_backend_service_commands_use_backend_root_directory() -> None:
    deploy = load_config("backend/railway.toml")["deploy"]

    assert deploy["preDeployCommand"] == "alembic upgrade head"
    assert deploy["startCommand"].startswith("uvicorn app.main:app")
    assert "cd backend" not in deploy["preDeployCommand"]
    assert "cd backend" not in deploy["startCommand"]


def test_frontend_service_commands_use_frontend_root_directory() -> None:
    config = load_config("frontend/railway.toml")
    assert config["build"]["buildCommand"] == "npm ci && npm run build"
    assert config["deploy"]["startCommand"] == "npm start"
    assert "cd frontend" not in config["build"]["buildCommand"]
    assert "cd frontend" not in config["deploy"]["startCommand"]


def test_repository_root_fallback_keeps_its_explicit_backend_directory() -> None:
    deploy = load_config("railway.toml")["deploy"]
    assert deploy["preDeployCommand"].startswith("cd backend &&")
    assert deploy["startCommand"].startswith("cd backend &&")
