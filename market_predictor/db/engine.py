from __future__ import annotations

import os
from pathlib import Path
from threading import Lock
from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import sessionmaker, Session

from market_predictor.config import project_root
from market_predictor.db.models import Base


def _database_url() -> str:
    configured = os.environ.get("DATABASE_URL", "sqlite:///./data/stonk.db")
    sqlite_prefix = "sqlite:///"
    if configured.startswith(sqlite_prefix) and not configured.startswith("sqlite:////"):
        relative_path = configured.removeprefix(sqlite_prefix)
        if relative_path != ":memory:":
            absolute_path = (project_root() / relative_path).resolve()
            absolute_path.parent.mkdir(parents=True, exist_ok=True)
            return f"{sqlite_prefix}{absolute_path}"
    return configured


DATABASE_URL = _database_url()
_INITIALIZED_ENGINES: set[int] = set()
_INITIALIZE_LOCK = Lock()

def get_engine() -> Engine:
    """Creates and returns a SQLAlchemy engine."""
    return create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
        echo=False
    )

def get_session_factory(engine: Engine | None = None) -> sessionmaker[Session]:
    """Returns a session factory."""
    return sessionmaker(bind=engine or get_engine(), autoflush=False, autocommit=False)


def initialize_database(engine: Engine) -> None:
    """Provision missing tables for local runs; Alembic remains the deployment migration path."""
    engine_key = id(engine)
    if engine_key in _INITIALIZED_ENGINES:
        return
    with _INITIALIZE_LOCK:
        if engine_key in _INITIALIZED_ENGINES:
            return
        Base.metadata.create_all(engine)
        _INITIALIZED_ENGINES.add(engine_key)
