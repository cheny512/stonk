from __future__ import annotations

from datetime import date, timedelta
from market_predictor.data_providers.router import provider_name_for_as_of, HISTORICAL_CUTOFF_DAYS

def test_provider_selection_historical():
    old_date = (date.today() - timedelta(days=HISTORICAL_CUTOFF_DAYS + 1)).isoformat()
    assert provider_name_for_as_of(old_date) == "thetadata"

def test_provider_selection_recent_defaults_to_thetadata(monkeypatch):
    monkeypatch.delenv("STONK_OPTIONS_PROVIDER", raising=False)
    recent_date = (date.today() - timedelta(days=1)).isoformat()
    assert provider_name_for_as_of(recent_date) == "thetadata"

def test_provider_selection_forced_mode(monkeypatch):
    monkeypatch.delenv("STONK_OPTIONS_PROVIDER", raising=False)
    recent_date = (date.today() - timedelta(days=1)).isoformat()
    assert provider_name_for_as_of(recent_date, mode="training") == "thetadata"
    
    old_date = (date.today() - timedelta(days=HISTORICAL_CUTOFF_DAYS + 1)).isoformat()
    assert provider_name_for_as_of(old_date, mode="live") == "thetadata"

def test_provider_selection_boundary(monkeypatch):
    monkeypatch.delenv("STONK_OPTIONS_PROVIDER", raising=False)
    # Exactly at boundary
    boundary_date = (date.today() - timedelta(days=HISTORICAL_CUTOFF_DAYS)).isoformat()
    # If age_days > HISTORICAL_CUTOFF_DAYS, it's thetadata. 
    # At the live boundary, use the configured local-first provider.
    assert provider_name_for_as_of(boundary_date) == "thetadata"


def test_massive_can_still_be_selected_explicitly(monkeypatch):
    monkeypatch.setenv("STONK_OPTIONS_PROVIDER", "massive")
    assert provider_name_for_as_of(date.today().isoformat(), mode="live") == "massive"
