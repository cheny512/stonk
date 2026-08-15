from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from datetime import date, timedelta
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from market_predictor.data import PriceRow
from market_predictor.db.models import Base
from scripts.api_server import app, get_database_session

client = TestClient(app)


@pytest.fixture
def account_client():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    def override_database_session():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_database_session] = override_database_session
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_database_session, None)
        engine.dispose()


@pytest.fixture(autouse=True)
def _stub_live_quote(monkeypatch):
    monkeypatch.setattr(
        "scripts.api_server.get_live_quote",
        lambda ticker: {
            "ticker": ticker,
            "provider": "fixture",
            "price": 100.0,
            "open": 99.0,
            "high": 101.0,
            "low": 98.0,
            "volume": 1_000_000,
            "asOf": "2026-08-14",
            "delayed": True,
        },
    )

def test_api_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_anonymous_profile_and_watchlist_sync(account_client):
    created = account_client.post("/api/users/anonymous", json={"timezone": "America/New_York"})

    assert created.status_code == 201
    profile = created.json()
    assert profile["accessToken"]
    assert profile["user"]["accountKind"] == "anonymous"
    assert profile["user"]["timezone"] == "America/New_York"
    assert profile["watchlist"] == {"tickers": []}

    unauthorized = account_client.get("/api/users/me/watchlist")
    assert unauthorized.status_code == 401
    assert unauthorized.json()["error"]["code"] == "unauthorized"

    headers = {"Authorization": f"Bearer {profile['accessToken']}"}
    updated = account_client.put(
        "/api/users/me/watchlist",
        headers=headers,
        json={"tickers": [" msft ", "AAPL", "MSFT", "$$$"]},
    )

    assert updated.status_code == 200
    assert updated.json() == {"tickers": ["MSFT", "AAPL"]}
    assert account_client.get("/api/users/me/watchlist", headers=headers).json() == {
        "tickers": ["MSFT", "AAPL"]
    }
    profile_response = account_client.get("/api/users/me", headers=headers)
    assert profile_response.status_code == 200
    assert "accessToken" not in profile_response.text

def test_api_metrics():
    # Metrics endpoint has trailing slash because of mounting
    response = client.get("/metrics/")
    assert response.status_code == 200
    assert "stonk_" in response.text

def test_api_universe():
    response = client.get("/api/universe")
    assert response.status_code == 200
    assert "tickers" in response.json()

def test_stock_history_is_available_without_a_trained_model(monkeypatch):
    rows = [
        PriceRow(
            date=f"2026-01-{day:02d}",
            open=100 + day,
            high=102 + day,
            low=99 + day,
            close=101 + day,
            volume=1_000_000 + day,
            extras={},
        )
        for day in range(1, 4)
    ]
    monkeypatch.setattr("scripts.api_server.load_ticker_rows", lambda ticker: rows)

    response = client.get("/api/stock/AAPL/history")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ticker"] == "AAPL"
    assert payload["interval"] == "1d"
    assert payload["adjusted"] is True
    assert len(payload["series"]) == 3


def test_stock_autopilot_runs_backtest_and_builds_plan(monkeypatch):
    start = date(2025, 1, 1)
    rows = [
        PriceRow(
            date=(start + timedelta(days=index)).isoformat(),
            open=100 + index * 0.1,
            high=102 + index * 0.1,
            low=99 + index * 0.1,
            close=101 + index * 0.1,
            volume=1_000_000 + index,
            extras={},
        )
        for index in range(240)
    ]
    research = {
        "history": {"return1y": None, "drawdownFrom52wHigh": -0.01},
        "volatility": {"realized1y": 0.2},
        "indicators": {"trend": "uptrend", "rsi14": 60.0},
        "events": {"items": []},
    }
    monkeypatch.setattr("scripts.api_server._load_trained_model", lambda: {"settings": {"momentum5": {"enabled": True, "weight": 1.0}}})
    monkeypatch.setattr("scripts.api_server.load_ticker_rows", lambda ticker: rows)
    monkeypatch.setattr("scripts.api_server.build_stock_research", lambda *args, **kwargs: research)

    response = client.post("/api/stock/AAPL/autopilot", json={"refresh": False, "include_options": False})

    assert response.status_code == 200
    payload = response.json()
    assert payload["autopilot"] is True
    assert payload["backtest"]["testCount"] > 0
    assert payload["tradePlan"]["entryZone"]
    assert payload["thesis"]["methodology"]
    assert payload["walkForward"]["validation_scheme"] == "expanding-window-purged"
    assert payload["walkForward"]["benchmark_name"] == "underlying-buy-and-hold"


def test_stock_autopilot_trains_itself_when_saved_model_is_missing(monkeypatch):
    start = date(2024, 1, 1)
    rows = [
        PriceRow(
            date=(start + timedelta(days=index)).isoformat(),
            open=100 + index * 0.08,
            high=102 + index * 0.08,
            low=99 + index * 0.08,
            close=101 + index * 0.08 + (index % 7 - 3) * 0.1,
            volume=1_000_000 + index * 100,
            extras={},
        )
        for index in range(260)
    ]
    monkeypatch.setattr("scripts.api_server._load_trained_model", lambda: {})
    monkeypatch.setattr("scripts.api_server.load_ticker_rows", lambda ticker: rows)
    monkeypatch.setattr("scripts.api_server.build_stock_research", lambda *args, **kwargs: {
        "history": {"return1y": None, "drawdownFrom52wHigh": -0.02},
        "volatility": {"realized1y": 0.2},
        "indicators": {"trend": "uptrend", "rsi14": 60.0},
        "events": {"items": []},
    })

    response = client.post("/api/stock/AAPL/autopilot", json={"refresh": False, "include_options": False})

    assert response.status_code == 200
    assert response.json()["modelOrigin"] == "ephemeral-ticker-model"


def test_stock_autopilot_sanitizes_options_provider_errors(monkeypatch):
    monkeypatch.setattr("scripts.api_server._load_trained_model", lambda: {"settings": {"momentum5": {"enabled": True, "weight": 1.0}}})
    monkeypatch.setattr("scripts.api_server.fetch_ticker_history", lambda *args, **kwargs: None)
    monkeypatch.setattr("scripts.api_server.load_ticker_rows", lambda ticker: [
        PriceRow(
            date=(date(2025, 1, 1) + timedelta(days=index)).isoformat(),
            open=100 + index * 0.1,
            high=102 + index * 0.1,
            low=99 + index * 0.1,
            close=101 + index * 0.1,
            volume=1_000_000 + index,
            extras={},
        )
        for index in range(180)
    ])
    monkeypatch.setattr("scripts.api_server.build_stock_research", lambda *args, **kwargs: {
        "history": {}, "volatility": {}, "indicators": {}, "events": {"items": []}
    })
    monkeypatch.setattr("market_predictor.data.load_options_chain", lambda *args, **kwargs: (_ for _ in ()).throw(RuntimeError("apiKey=secret-value")))

    response = client.post("/api/stock/AAPL/autopilot", json={"refresh": False})

    assert response.status_code == 200
    options = response.json()["options"]
    assert options["available"] is False
    assert "secret-value" not in options["message"]


def test_stock_autopilot_marks_options_informational_when_trade_is_rejected(monkeypatch):
    rows = [
        PriceRow(
            date=(date(2025, 1, 1) + timedelta(days=index)).isoformat(),
            open=100 + index * 0.1,
            high=102 + index * 0.1,
            low=99 + index * 0.1,
            close=101 + index * 0.1,
            volume=1_000_000 + index,
            extras={},
        )
        for index in range(180)
    ]
    monkeypatch.setattr("scripts.api_server._load_trained_model", lambda: {"settings": {"momentum5": {"enabled": True, "weight": 1.0}}})
    monkeypatch.setattr("scripts.api_server.load_ticker_rows", lambda ticker: rows)
    monkeypatch.setattr("scripts.api_server.build_stock_research", lambda *args, **kwargs: {
        "history": {}, "volatility": {}, "indicators": {}, "events": {"items": []}
    })
    monkeypatch.setattr("market_predictor.data.load_options_chain", lambda *args, **kwargs: object())
    monkeypatch.setattr(
        "scripts.api_server.attach_options_to_signal",
        lambda result, *args, **kwargs: result.update({"options": {"available": True, "contracts": []}}),
    )
    monkeypatch.setattr("scripts.api_server.build_trade_plan", lambda *args, **kwargs: {"action": "No trade"})
    monkeypatch.setattr("scripts.api_server.build_rules_thesis", lambda *args, **kwargs: {"methodology": "fixture"})

    response = client.post("/api/stock/AAPL/autopilot", json={"refresh": False, "include_options": True})

    assert response.status_code == 200
    options = response.json()["options"]
    assert options["tradeEligible"] is False
    assert "only to teach" in options["screeningNote"]


def test_walk_forward_endpoint_reports_integrity_controls(monkeypatch):
    start = date(2023, 1, 1)
    rows = [
        PriceRow(
            date=(start + timedelta(days=index)).isoformat(),
            open=100 + index * 0.05,
            high=101 + index * 0.05,
            low=99 + index * 0.05,
            close=100.5 + index * 0.05 + (index % 11 - 5) * 0.08,
            volume=1_000_000 + (index % 20) * 1000,
            extras={},
        )
        for index in range(280)
    ]
    monkeypatch.setattr("scripts.api_server.load_ticker_rows", lambda ticker: rows)

    response = client.post(
        "/api/research/walk-forward/AAPL",
        json={"horizon": 5, "min_train_size": 80, "test_size": 30},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["validation_scheme"] == "expanding-window-purged"
    assert payload["purge_gap"] == 5
    assert payload["methodology"]["purgedBoundary"] is True
    assert payload["benchmark_name"] == "underlying-buy-and-hold"
