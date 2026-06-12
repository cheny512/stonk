from __future__ import annotations

import pytest
from datetime import date, timedelta
from market_predictor.data_providers.router import provider_name_for_as_of, HISTORICAL_CUTOFF_DAYS

def test_provider_selection_historical():
    old_date = (date.today() - timedelta(days=HISTORICAL_CUTOFF_DAYS + 1)).isoformat()
    assert provider_name_for_as_of(old_date) == "thetadata"

def test_provider_selection_recent():
    recent_date = (date.today() - timedelta(days=1)).isoformat()
    assert provider_name_for_as_of(recent_date) == "massive"

def test_provider_selection_forced_mode():
    recent_date = (date.today() - timedelta(days=1)).isoformat()
    assert provider_name_for_as_of(recent_date, mode="training") == "thetadata"
    
    old_date = (date.today() - timedelta(days=HISTORICAL_CUTOFF_DAYS + 1)).isoformat()
    assert provider_name_for_as_of(old_date, mode="live") == "massive"

def test_provider_selection_boundary():
    # Exactly at boundary
    boundary_date = (date.today() - timedelta(days=HISTORICAL_CUTOFF_DAYS)).isoformat()
    # If age_days > HISTORICAL_CUTOFF_DAYS, it's thetadata. 
    # If exactly 7, age_days > 7 is False, so it's massive.
    assert provider_name_for_as_of(boundary_date) == "massive"
