from datetime import date, timedelta

from market_predictor.data_providers.router import (
    HISTORICAL_CUTOFF_DAYS,
    equity_provider_name,
    provider_name_for_as_of,
)


def test_training_mode_always_thetadata():
    assert provider_name_for_as_of(date.today().isoformat(), mode="training") == "thetadata"


def test_live_mode_defaults_to_thetadata(monkeypatch):
    monkeypatch.delenv("STONK_OPTIONS_PROVIDER", raising=False)
    assert provider_name_for_as_of(date.today().isoformat(), mode="live") == "thetadata"


def test_auto_uses_thetadata_for_old_dates():
    old = (date.today() - timedelta(days=HISTORICAL_CUTOFF_DAYS + 1)).isoformat()
    assert provider_name_for_as_of(old, mode="auto") == "thetadata"


def test_equity_recent_end_uses_massive():
    assert equity_provider_name(date.today().isoformat(), mode="auto") == "massive"
