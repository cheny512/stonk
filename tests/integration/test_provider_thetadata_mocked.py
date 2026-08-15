from __future__ import annotations

import re
import respx
import httpx
import pytest
from market_predictor.data_providers.thetadata import ThetaDataProvider

@respx.mock
def test_thetadata_fetch_bars():
    ticker = "AAPL"
    
    # Mock ThetaData response
    respx.get(url__regex=r".*/v2/hist/stock/eod.*").mock(return_value=httpx.Response(200, json={
        "response": [
            {"date": 20240101, "open": 100.0, "high": 105.0, "low": 95.0, "close": 102.0, "volume": 1000000}
        ],
        "status": 200
    }))
    
    provider = ThetaDataProvider(username="test-user", password="test-password")
    # provider.fetch_equity_bars converts dates to ThetaData format
    bars = provider.fetch_equity_bars(ticker, "2024-01-01", "2024-01-01")
    
    assert len(bars) == 1
    assert bars[0].close == 102.0
