from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
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
