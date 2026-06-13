from __future__ import annotations

import os
from sqlalchemy import create_engine, Engine
from sqlalchemy.orm import sessionmaker, Session

DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./data/stonk.db")

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
