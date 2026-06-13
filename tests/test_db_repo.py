from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from market_predictor.db.models import Base
from market_predictor.db.repo import upsert_bars, get_bars
from market_predictor.data import PriceRow

@pytest.fixture
def db_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session

def test_upsert_and_get_bars(db_session):
    ticker = "TEST"
    rows = [
        PriceRow("2024-01-01", 100.0, 105.0, 95.0, 102.0, 1000000, {}),
        PriceRow("2024-01-02", 102.0, 106.0, 101.0, 104.0, 1100000, {})
    ]
    
    # First insert
    inserted = upsert_bars(db_session, ticker, rows)
    assert inserted == 2
    
    # Idempotency check
    inserted_again = upsert_bars(db_session, ticker, rows)
    assert inserted_again == 0
    
    # Retrieve
    retrieved = get_bars(db_session, ticker)
    assert len(retrieved) == 2
    assert retrieved[0].close == 102.0
    assert retrieved[1].date == "2024-01-02"

def test_get_bars_range(db_session):
    ticker = "TEST"
    rows = [
        PriceRow("2024-01-01", 100.0, 105.0, 95.0, 102.0, 1000000, {}),
        PriceRow("2024-01-02", 102.0, 106.0, 101.0, 104.0, 1100000, {}),
        PriceRow("2024-01-03", 104.0, 108.0, 103.0, 107.0, 1200000, {})
    ]
    upsert_bars(db_session, ticker, rows)
    
    retrieved = get_bars(db_session, ticker, start="2024-01-02", end="2024-01-02")
    assert len(retrieved) == 1
    assert retrieved[0].date == "2024-01-02"
