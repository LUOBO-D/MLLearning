"""Application paths and local-only configuration."""

from __future__ import annotations

import os
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[3]
BACKEND_ROOT = PROJECT_ROOT / "backend"
DEFAULT_DATABASE_PATH = BACKEND_ROOT / "data" / "mlearning.db"
DEFAULT_CONTENT_PATH = PROJECT_ROOT / "content" / "concepts.json"
DEFAULT_DIAGNOSTIC_PATH = PROJECT_ROOT / "content" / "diagnostic.json"
DEFAULT_FOUNDATIONS_PATH = PROJECT_ROOT / "content" / "foundations.json"
DEFAULT_CURRICULUM_PATH = PROJECT_ROOT / "content" / "curriculum.json"
FRONTEND_DIST = PROJECT_ROOT / "frontend" / "dist"
LOCAL_TIMEZONE = "Asia/Shanghai"
DAILY_GOAL_MINUTES = 60


def database_path() -> Path:
    """Resolve the SQLite path for each app factory call (useful for tests)."""

    configured = os.getenv("MLLEARNING_DB_PATH")
    path = Path(configured).expanduser() if configured else DEFAULT_DATABASE_PATH
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def content_path() -> Path:
    configured = os.getenv("MLLEARNING_CONTENT_PATH")
    return Path(configured).expanduser().resolve() if configured else DEFAULT_CONTENT_PATH


def diagnostic_path() -> Path:
    configured = os.getenv("MLLEARNING_DIAGNOSTIC_PATH")
    return Path(configured).expanduser().resolve() if configured else DEFAULT_DIAGNOSTIC_PATH


def foundations_path() -> Path:
    configured = os.getenv("MLLEARNING_FOUNDATIONS_PATH")
    return Path(configured).expanduser().resolve() if configured else DEFAULT_FOUNDATIONS_PATH


def curriculum_path() -> Path:
    configured = os.getenv("MLLEARNING_CURRICULUM_PATH")
    return Path(configured).expanduser().resolve() if configured else DEFAULT_CURRICULUM_PATH
