from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from datetime import date, timedelta

from market_predictor.data import PriceRow
from scripts.api_server import app

client = TestClient(app)

def test_api_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

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
