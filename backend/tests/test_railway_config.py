import json
import tomllib
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def load_config(path: str) -> dict:
    with (REPOSITORY_ROOT / path).open("rb") as config_file:
        return tomllib.load(config_file)


def load_json(path: str) -> dict:
    return json.loads((REPOSITORY_ROOT / path).read_text())


def test_backend_service_commands_use_backend_root_directory() -> None:
    deploy = load_config("backend/railway.toml")["deploy"]

    assert deploy["preDeployCommand"] == ["alembic upgrade head"]
    assert deploy["startCommand"].startswith("alembic upgrade head && uvicorn app.main:app")
    assert all("cd backend" not in command for command in deploy["preDeployCommand"])
    assert "cd backend" not in deploy["startCommand"]


def test_backend_nixpacks_uses_requirements_provider() -> None:
    config = load_config("backend/nixpacks.toml")

    assert config["providers"] == ["python"]
    assert config["variables"]["NIXPACKS_PYTHON_VERSION"] == "3.12"
    assert config["variables"]["NIXPACKS_PYTHON_PACKAGE_MANAGER"] == "requirements"
    assert (REPOSITORY_ROOT / "backend" / ".python-version").read_text().strip() == "3.12"


def test_frontend_service_commands_use_frontend_root_directory() -> None:
    config = load_config("frontend/railway.toml")
    assert config["build"]["buildCommand"] == "npm run build"
    assert config["deploy"]["startCommand"] == "npm start"
    assert "cd frontend" not in config["build"]["buildCommand"]
    assert "cd frontend" not in config["deploy"]["startCommand"]
    assert (
        load_json("frontend/package-lock.json")["packages"][""]["engines"]["node"]
        == "^20.19.0 || >=22.12.0"
    )
    assert (REPOSITORY_ROOT / "frontend" / ".nvmrc").read_text().strip() == "22.12.0"


def test_repository_root_fallback_keeps_its_explicit_backend_directory() -> None:
    deploy = load_config("railway.toml")["deploy"]
    assert deploy["preDeployCommand"] == ["cd backend && alembic upgrade head"]
    assert deploy["startCommand"].startswith("cd backend && alembic upgrade head && uvicorn app.main:app")
