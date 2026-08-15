from __future__ import annotations

import httpx
import pytest
import respx

import market_predictor.data_providers.thetadata as theta_module
from market_predictor.data_providers.thetadata import ThetaDataProvider, ThetaDataUnavailable


@pytest.fixture(autouse=True)
def disable_provider_cache(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(theta_module, "read_parquet_or_csv", lambda _path: None)
    monkeypatch.setattr(theta_module, "write_parquet_or_csv", lambda _path, _rows: None)


@respx.mock
def test_thetadata_v3_fetches_stock_eod_bars() -> None:
    route = respx.get(url__regex=r".*/v3/stock/history/eod.*").mock(
        return_value=httpx.Response(
            200,
            json={
                "response": [
                    {
                        "created": "2024-01-02T17:17:53.606",
                        "open": 100.0,
                        "high": 105.0,
                        "low": 95.0,
                        "close": 102.0,
                        "volume": 1_000_000,
                    }
                ]
            },
        )
    )

    provider = ThetaDataProvider(base_url="http://127.0.0.1:25503/v3")
    bars = provider.fetch_equity_bars("AAPL", "2024-01-02", "2024-01-02")

    assert route.called
    assert len(bars) == 1
    assert bars[0].date == "2024-01-02"
    assert bars[0].close == 102.0


@respx.mock
def test_thetadata_v3_builds_live_chain_from_nested_responses() -> None:
    base = "http://127.0.0.1:25503/v3"
    contract = {"symbol": "AAPL", "expiration": "2026-09-18", "strike": 220.0, "right": "CALL"}
    respx.get(url__regex=r".*/option/snapshot/greeks/all.*").mock(
        return_value=httpx.Response(403, json={"error": "professional subscription required"})
    )
    respx.get(url__regex=r".*/option/snapshot/quote.*").mock(
        return_value=httpx.Response(
            200,
            json={"response": [{"contract": contract, "data": [{"bid": 4.8, "ask": 5.2}]}]},
        )
    )
    respx.get(url__regex=r".*/option/snapshot/open_interest.*").mock(
        return_value=httpx.Response(
            200,
            json={"response": [{"contract": contract, "data": [{"open_interest": 850}]}]},
        )
    )
    respx.get(url__regex=r".*/option/snapshot/ohlc.*").mock(
        return_value=httpx.Response(
            200,
            json={"response": [{"contract": contract, "data": [{"close": 5.0, "volume": 120}]}]},
        )
    )
    respx.get(url__regex=r".*/stock/snapshot/ohlc.*").mock(
        return_value=httpx.Response(200, json={"response": [{"close": 215.25}]})
    )

    chain = ThetaDataProvider(base_url=base, live=True, use_snapshots=True).fetch_options_chain(
        "AAPL", "2026-08-14"
    )

    assert chain.provider == "thetadata"
    assert chain.spot == 215.25
    assert len(chain.quotes) == 1
    assert chain.quotes[0].mid == 5.0
    assert chain.quotes[0].open_interest == 850
    assert chain.quotes[0].volume == 120


@respx.mock
def test_thetadata_v3_reports_terminal_not_running() -> None:
    respx.get(url__regex=r".*/v3/stock/history/eod.*").mock(
        side_effect=httpx.ConnectError("connection refused")
    )
    provider = ThetaDataProvider(base_url="http://127.0.0.1:25503/v3")

    with pytest.raises(ThetaDataUnavailable, match="Start ThetaTerminalv3.jar"):
        provider.fetch_equity_bars("AAPL", "2024-01-02", "2024-01-02")
