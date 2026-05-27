from __future__ import annotations

from datetime import date

import httpx

from ..cache import cache_path, read_parquet_or_csv, write_parquet_or_csv
from ..config import massive_api_base, massive_api_key
from .base import DataProvider
from .types import EquityBar, OptionQuote, OptionsChain


class PolygonProvider(DataProvider):
    """
    Live and recent US equity/options via Massive REST API.

    Massive is the rebrand of Polygon.io (Oct 2025). Same endpoints and apiKey auth.
    Docs: https://massive.com/docs/rest/stocks/overview
    """

    name = "massive"

    def __init__(self, api_key: str | None = None, base_url: str | None = None) -> None:
        self.api_key = api_key or massive_api_key()
        self.base_url = (base_url or massive_api_base()).rstrip("/")
        if not self.api_key:
            raise ValueError("Set MASSIVE_API_KEY (or POLYGON_API_KEY) in .env")

    def _get(self, path: str, params: dict | None = None) -> dict:
        query = dict(params or {})
        query["apiKey"] = self.api_key
        with httpx.Client(timeout=60.0) as client:
            response = client.get(f"{self.base_url}{path}", params=query)
            response.raise_for_status()
            return response.json()

    def fetch_equity_bars(self, ticker: str, start: str, end: str) -> list[EquityBar]:
        symbol = ticker.upper()
        cache_file = cache_path("equity", "massive", symbol, f"{start}_{end}")
        cached = read_parquet_or_csv(cache_file)
        if cached is not None:
            return [_bar_from_row(row) for row in cached]

        # https://massive.com/docs/rest/stocks/aggregates/custom-bars
        payload = self._get(
            f"/v2/aggs/ticker/{symbol}/range/1/day/{start}/{end}",
            {"adjusted": "true", "sort": "asc", "limit": 50000},
        )
        rows: list[dict] = []
        for item in payload.get("results", []):
            rows.append(
                {
                    "date": date.fromtimestamp(item["t"] / 1000).isoformat(),
                    "open": float(item["o"]),
                    "high": float(item["h"]),
                    "low": float(item["l"]),
                    "close": float(item["c"]),
                    "volume": float(item.get("v", 0)),
                }
            )
        write_parquet_or_csv(cache_file, rows)
        return [_bar_from_row(row) for row in rows]

    def fetch_options_chain(self, ticker: str, as_of: str) -> OptionsChain:
        symbol = ticker.upper()
        cache_file = cache_path("options", "massive", symbol, as_of)
        cached = read_parquet_or_csv(cache_file)
        if cached is not None:
            quotes = [_quote_from_row(row) for row in cached]
            spot = cached[0].get("spot") if cached else None
            return OptionsChain(
                underlying=symbol,
                as_of=as_of,
                spot=float(spot) if spot not in (None, "") else None,
                quotes=quotes,
                provider=self.name,
            )

        # https://massive.com/docs/rest/options/snapshots/option-chain-snapshot
        payload = self._get(f"/v3/snapshot/options/{symbol}")
        quotes: list[OptionQuote] = []
        spot: float | None = None
        for item in payload.get("results", []):
            details = item.get("details") or {}
            greeks = item.get("greeks") or {}
            day = item.get("day") or {}
            underlying = item.get("underlying_asset") or {}
            if spot is None and underlying.get("price") is not None:
                spot = float(underlying["price"])
            bid = float((item.get("last_quote") or {}).get("bid", 0) or 0)
            ask = float((item.get("last_quote") or {}).get("ask", 0) or 0)
            mid = (bid + ask) / 2 if bid or ask else float(day.get("close", 0) or 0)
            quotes.append(
                OptionQuote(
                    symbol=str(details.get("ticker", "")),
                    underlying=symbol,
                    expiration=str(details.get("expiration_date", "")),
                    strike=float(details.get("strike_price", 0)),
                    right=str(details.get("contract_type", "")).lower(),
                    bid=bid,
                    ask=ask,
                    mid=mid,
                    implied_vol=_maybe_float(item.get("implied_volatility")),
                    delta=_maybe_float(greeks.get("delta")),
                    open_interest=_maybe_float((item.get("open_interest") or {}).get("value")),
                    volume=_maybe_float(day.get("volume")),
                )
            )

        rows = [
            {
                "spot": spot,
                "symbol": q.symbol,
                "underlying": q.underlying,
                "expiration": q.expiration,
                "strike": q.strike,
                "right": q.right,
                "bid": q.bid,
                "ask": q.ask,
                "mid": q.mid,
                "implied_vol": q.implied_vol,
                "delta": q.delta,
                "open_interest": q.open_interest,
                "volume": q.volume,
            }
            for q in quotes
        ]
        write_parquet_or_csv(cache_file, rows)
        return OptionsChain(
            underlying=symbol,
            as_of=as_of,
            spot=spot,
            quotes=quotes,
            provider=self.name,
        )

    def last_trade(self, ticker: str) -> dict:
        """https://massive.com/docs/rest/stocks/trades-quotes/last-trade"""
        symbol = ticker.upper()
        payload = self._get(f"/v2/last/trade/{symbol}")
        return payload.get("results") or {}

    def snapshot_ticker(self, ticker: str) -> dict:
        """Full market snapshot for one ticker."""
        symbol = ticker.upper()
        payload = self._get(f"/v2/snapshot/locale/us/markets/stocks/tickers/{symbol}")
        return payload.get("ticker") or {}


def _maybe_float(value) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _bar_from_row(row: dict) -> EquityBar:
    return EquityBar(
        date=str(row["date"]),
        open=float(row["open"]),
        high=float(row["high"]),
        low=float(row["low"]),
        close=float(row["close"]),
        volume=float(row.get("volume", 0)),
    )


def _quote_from_row(row: dict) -> OptionQuote:
    return OptionQuote(
        symbol=str(row["symbol"]),
        underlying=str(row["underlying"]),
        expiration=str(row["expiration"]),
        strike=float(row["strike"]),
        right=str(row["right"]),
        bid=float(row["bid"]),
        ask=float(row["ask"]),
        mid=float(row["mid"]),
        implied_vol=_maybe_float(row.get("implied_vol")),
        delta=_maybe_float(row.get("delta")),
        open_interest=_maybe_float(row.get("open_interest")),
        volume=_maybe_float(row.get("volume")),
    )
