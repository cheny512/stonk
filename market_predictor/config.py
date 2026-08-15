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


def thetadata_api_key() -> str | None:
    """API key consumed by Theta Terminal v3 when the terminal starts."""
    value = os.getenv("THETADATA_API_KEY", "").strip()
    return value or None


def thetadata_base_url() -> str:
    """Local REST endpoint exposed by Theta Terminal v3."""
    value = os.getenv("THETADATA_BASE_URL", "http://127.0.0.1:25503/v3").strip()
    return (value or "http://127.0.0.1:25503/v3").rstrip("/")


def thetadata_snapshots_enabled() -> bool:
    """Paid Theta snapshot endpoints are opt-in; free EOD chains are the default."""
    value = os.getenv("THETADATA_USE_SNAPSHOTS", "false").strip().lower()
    return value in {"1", "true", "yes", "on"}


def options_provider() -> str:
    """Provider used for option chains. ThetaData is the local-first default."""
    value = os.getenv("STONK_OPTIONS_PROVIDER", "thetadata").strip().lower()
    if value not in {"thetadata", "massive"}:
        raise ValueError("STONK_OPTIONS_PROVIDER must be 'thetadata' or 'massive'")
    return value


def api_host() -> str:
    return os.getenv("API_HOST", "127.0.0.1")


def api_port() -> int:
    return int(os.getenv("API_PORT", "8000"))
