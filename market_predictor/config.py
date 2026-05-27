from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(_ROOT / ".env")


def project_root() -> Path:
    return _ROOT


def data_dir() -> Path:
    raw = os.getenv("DATA_DIR", "./data")
    path = Path(raw)
    if not path.is_absolute():
        path = _ROOT / path
    path.mkdir(parents=True, exist_ok=True)
    return path


def massive_api_key() -> str | None:
    """Massive.com API key (formerly Polygon.io). Either env var works."""
    for name in ("MASSIVE_API_KEY", "POLYGON_API_KEY"):
        value = os.getenv(name, "").strip()
        if value:
            return value
    return None


def massive_api_base() -> str:
    """REST base URL. Legacy api.polygon.io still supported by Massive."""
    return os.getenv("MASSIVE_API_BASE", "https://api.massive.com").strip() or "https://api.massive.com"


def polygon_api_key() -> str | None:
    """Backward-compatible alias for massive_api_key()."""
    return massive_api_key()


def thetadata_username() -> str | None:
    value = os.getenv("THETADATA_USERNAME", "").strip()
    return value or None


def thetadata_password() -> str | None:
    value = os.getenv("THETADATA_PASSWORD", "").strip()
    return value or None


def api_host() -> str:
    return os.getenv("API_HOST", "127.0.0.1")


def api_port() -> int:
    return int(os.getenv("API_PORT", "8000"))
