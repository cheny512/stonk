from __future__ import annotations

import httpx

from ..cache import cache_path, read_parquet_or_csv, write_parquet_or_csv
from ..config import thetadata_password, thetadata_username
from .base import DataProvider
from .types import EquityBar, OptionQuote, OptionsChain


class ThetaDataProvider(DataProvider):
    """Deep historical options chains for training (ThetaData REST v2)."""

    name = "thetadata"
    base_url = "https://api.thetadata.net"

    def __init__(self, username: str | None = None, password: str | None = None) -> None:
        self.username = username or thetadata_username()
        self.password = password or thetadata_password()
        if not self.username or not self.password:
            raise ValueError("THETADATA_USERNAME and THETADATA_PASSWORD must be set")

    def _get(self, path: str, params: dict | None = None) -> dict:
        with httpx.Client(timeout=120.0) as client:
            response = client.get(
                f"{self.base_url}{path}",
                params=params or {},
                auth=(self.username, self.password),
            )
            response.raise_for_status()
            return response.json()

    def fetch_equity_bars(self, ticker: str, start: str, end: str) -> list[EquityBar]:
        symbol = ticker.upper()
        cache_file = cache_path("equity", "thetadata", symbol, f"{start}_{end}")
        cached = read_parquet_or_csv(cache_file)
        if cached is not None:
            return [
                EquityBar(
                    date=str(row["date"]),
                    open=float(row["open"]),
                    high=float(row["high"]),
                    low=float(row["low"]),
                    close=float(row["close"]),
                    volume=float(row.get("volume", 0)),
                )
                for row in cached
            ]

        payload = self._get(
            "/v2/hist/stock/eod",
            {"root": symbol, "start_date": start.replace("-", ""), "end_date": end.replace("-", "")},
        )
        rows: list[dict] = []
        for item in payload.get("response", []):
            rows.append(
                {
                    "date": _format_date(item.get("date") or item.get("ms_of_day")),
                    "open": float(item.get("open", item.get("o", 0))),
                    "high": float(item.get("high", item.get("h", 0))),
                    "low": float(item.get("low", item.get("l", 0))),
                    "close": float(item.get("close", item.get("c", 0))),
                    "volume": float(item.get("volume", item.get("v", 0))),
                }
            )
        write_parquet_or_csv(cache_file, rows)
        return [
            EquityBar(
                date=str(row["date"]),
                open=float(row["open"]),
                high=float(row["high"]),
                low=float(row["low"]),
                close=float(row["close"]),
                volume=float(row["volume"]),
            )
            for row in rows
        ]

    def fetch_options_chain(self, ticker: str, as_of: str) -> OptionsChain:
        symbol = ticker.upper()
        cache_file = cache_path("options", "thetadata", symbol, as_of)
        cached = read_parquet_or_csv(cache_file)
        if cached is not None:
            quotes = [
                OptionQuote(
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
                for row in cached
            ]
            spot = cached[0].get("spot") if cached else None
            return OptionsChain(
                underlying=symbol,
                as_of=as_of,
                spot=float(spot) if spot not in (None, "") else None,
                quotes=quotes,
                provider=self.name,
            )

        as_of_compact = as_of.replace("-", "")
        payload = self._get(
            "/v2/bulk_hist/option/eod",
            {"root": symbol, "exp": 0, "start_date": as_of_compact, "end_date": as_of_compact},
        )
        quotes: list[OptionQuote] = []
        spot: float | None = None
        for item in payload.get("response", []):
            if spot is None and item.get("underlying_price") is not None:
                spot = float(item["underlying_price"])
            bid = float(item.get("bid", 0) or 0)
            ask = float(item.get("ask", 0) or 0)
            mid = (bid + ask) / 2 if bid or ask else float(item.get("close", 0) or 0)
            quotes.append(
                OptionQuote(
                    symbol=str(item.get("symbol", "")),
                    underlying=symbol,
                    expiration=_format_date(item.get("expiration")),
                    strike=float(item.get("strike", 0)),
                    right=str(item.get("right", item.get("call_put", ""))).lower(),
                    bid=bid,
                    ask=ask,
                    mid=mid,
                    implied_vol=_maybe_float(item.get("iv")),
                    delta=_maybe_float(item.get("delta")),
                    open_interest=_maybe_float(item.get("open_interest")),
                    volume=_maybe_float(item.get("volume")),
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


def _maybe_float(value) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _format_date(value) -> str:
    if value is None:
        return ""
    text = str(value)
    if len(text) == 8 and text.isdigit():
        return f"{text[0:4]}-{text[4:6]}-{text[6:8]}"
    return text
