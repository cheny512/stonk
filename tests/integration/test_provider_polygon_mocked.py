from __future__ import annotations

import respx
import httpx
import pytest
from market_predictor.data_providers.polygon import PolygonProvider

@respx.mock
def test_polygon_fetch_bars():
    ticker = "AAPL"
    start = "2024-01-01"
    end = "2024-01-02"
    
    # Mock Polygon (Massive) response
    respx.get(url__regex=r".*/v2/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-01-02.*").mock(return_value=httpx.Response(200, json={
        "results": [
            {"t": 1704067200000, "o": 100.0, "h": 105.0, "l": 95.0, "c": 102.0, "v": 1000000}
        ],
        "status": "OK"
    }))
    
    provider = PolygonProvider(api_key="fake_key")
    bars = provider.fetch_equity_bars(ticker, start, end)
    
    assert len(bars) == 1
    assert bars[0].close == 102.0

