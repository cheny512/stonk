from __future__ import annotations

from datetime import date, timedelta
from typing import Any, Iterable

import httpx

from ..cache import cache_path, read_parquet_or_csv, write_parquet_or_csv
from ..config import thetadata_base_url, thetadata_snapshots_enabled
from .base import DataProvider
from .types import EquityBar, OptionQuote, OptionsChain


class ThetaDataError(RuntimeError):
    """Base error for sanitized ThetaData failures."""


class ThetaDataUnavailable(ThetaDataError):
    """Raised when the local Theta Terminal cannot be reached."""


class ThetaDataRequestError(ThetaDataError):
    def __init__(self, message: str, status_code: int) -> None:
        super().__init__(message)
        self.status_code = status_code


class ThetaDataProvider(DataProvider):
    """ThetaData v3 through the local Theta Terminal REST API."""

    name = "thetadata"

    def __init__(
        self,
        username: str | None = None,
        password: str | None = None,
        *,
        base_url: str | None = None,
        live: bool = False,
        use_snapshots: bool | None = None,
        timeout: float = 120.0,
        max_dte: int = 180,
        strike_range: int = 40,
    ) -> None:
        # username/password remain accepted so older callers do not break. In v3,
        # Theta Terminal owns authentication and Stonk calls only its local server.
        del username, password
        self.base_url = (base_url or thetadata_base_url()).rstrip("/")
        self.live = live
        self.use_snapshots = thetadata_snapshots_enabled() if use_snapshots is None else use_snapshots
        self.timeout = timeout
        self.max_dte = max_dte
        self.strike_range = strike_range

    def _get(self, path: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        query = {"format": "json", **(params or {})}
        try:
            with httpx.Client(timeout=self.timeout) as client:
                response = client.get(
                    f"{self.base_url}{path}",
                    params=query,
                    headers={"Accept": "application/json"},
                )
                response.raise_for_status()
        except httpx.ConnectError as exc:
            raise ThetaDataUnavailable(
                f"Theta Terminal v3 is not reachable at {self.base_url}. "
                "Start ThetaTerminalv3.jar and retry."
            ) from exc
        except httpx.TimeoutException as exc:
            raise ThetaDataUnavailable(
                f"Theta Terminal v3 timed out at {self.base_url}. Check the terminal logs and retry."
            ) from exc
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            detail = _response_message(exc.response)
            suffix = f": {detail}" if detail else ""
            raise ThetaDataRequestError(f"ThetaData v3 returned HTTP {status}{suffix}", status) from None

        try:
            payload = response.json()
        except ValueError as exc:
            raise ThetaDataError("ThetaData v3 returned a non-JSON response") from exc
        if not isinstance(payload, dict):
            raise ThetaDataError("ThetaData v3 returned an unexpected response shape")
        return payload

    def _optional_get(self, path: str, params: dict[str, Any]) -> dict[str, Any]:
        try:
            return self._get(path, params)
        except ThetaDataRequestError as exc:
            if exc.status_code in {403, 404, 422}:
                return {"response": []}
            raise

    def fetch_equity_bars(self, ticker: str, start: str, end: str) -> list[EquityBar]:
        symbol = ticker.upper()
        cache_file = cache_path("equity", "thetadata", symbol, f"{start}_{end}")
        cached = read_parquet_or_csv(cache_file)
        if cached is not None:
            return [_bar_from_row(row) for row in cached]

        payload = self._get(
            "/stock/history/eod",
            {
                "symbol": symbol,
                "start_date": start.replace("-", ""),
                "end_date": end.replace("-", ""),
            },
        )
        rows: list[dict[str, Any]] = []
        for item in _flatten_response(payload):
            created = str(item.get("created") or item.get("last_trade") or item.get("date") or "")
            close = _maybe_float(item.get("close"))
            if not created or close is None or close <= 0:
                continue
            rows.append(
                {
                    "date": _format_date(created[:10]),
                    "open": float(item.get("open", close) or close),
                    "high": float(item.get("high", close) or close),
                    "low": float(item.get("low", close) or close),
                    "close": close,
                    "volume": float(item.get("volume", 0) or 0),
                }
            )
        rows.sort(key=lambda row: str(row["date"]))
        if rows:
            write_parquet_or_csv(cache_file, rows)
        return [_bar_from_row(row) for row in rows]

    def fetch_options_chain(self, ticker: str, as_of: str) -> OptionsChain:
        symbol = ticker.upper()
        cache_file = cache_path("options", "thetadata", symbol, as_of)
        cached = read_parquet_or_csv(cache_file)
        if cached is not None:
            return _chain_from_cached(symbol, as_of, cached)

        recent = self.live or _is_recent(as_of)
        if recent and self.use_snapshots:
            try:
                records, spot = self._fetch_snapshot_records(symbol, as_of)
            except ThetaDataRequestError as exc:
                if exc.status_code not in {400, 403, 404}:
                    raise
                records, spot = [], None
            if not records:
                records, spot = self._fetch_recent_eod_records(symbol, as_of)
        elif recent:
            records, spot = self._fetch_recent_eod_records(symbol, as_of)
        else:
            records, spot = self._fetch_historical_records(symbol, as_of)

        quotes = _quotes_from_records(symbol, records)
        source_as_of = _records_as_of(records) or as_of
        rows = [_quote_cache_row(quote, spot, source_as_of) for quote in quotes]
        if rows:
            write_parquet_or_csv(cache_file, rows)
        return OptionsChain(
            underlying=symbol,
            as_of=source_as_of,
            spot=spot,
            quotes=quotes,
            provider=self.name,
        )

    def _chain_params(self, symbol: str) -> dict[str, Any]:
        return {
            "symbol": symbol,
            "expiration": "*",
            "max_dte": self.max_dte,
            "strike_range": self.strike_range,
        }

    def _fetch_snapshot_records(self, symbol: str, as_of: str) -> tuple[list[dict[str, Any]], float | None]:
        params = self._chain_params(symbol)
        greeks = list(_flatten_response(self._optional_get("/option/snapshot/greeks/all", params)))
        market = greeks or list(_flatten_response(self._get("/option/snapshot/quote", params)))
        open_interest = list(
            _flatten_response(self._get("/option/snapshot/open_interest", params))
        )
        ohlc = list(_flatten_response(self._get("/option/snapshot/ohlc", params)))
        records = _merge_contract_records(market, ohlc, open_interest)
        spot = _first_number(records, "underlying_price") or self._fetch_spot(symbol, as_of, live=True)
        return records, spot

    def _fetch_historical_records(self, symbol: str, as_of: str) -> tuple[list[dict[str, Any]], float | None]:
        compact = as_of.replace("-", "")
        params = {
            **self._chain_params(symbol),
            "start_date": compact,
            "end_date": compact,
        }
        eod = list(_flatten_response(self._get("/option/history/eod", params)))
        greeks = list(
            _flatten_response(self._optional_get("/option/history/greeks/eod", params))
        )
        open_interest = list(
            _flatten_response(self._optional_get("/option/history/open_interest", params))
        )
        records = _merge_contract_records(eod, greeks, open_interest)
        spot = _first_number(records, "underlying_price") or self._fetch_spot(symbol, as_of, live=False)
        return records, spot

    def _fetch_recent_eod_records(self, symbol: str, as_of: str) -> tuple[list[dict[str, Any]], float | None]:
        requested = date.fromisoformat(as_of[:10])
        candidate = min(requested, date.today() - timedelta(days=1))
        last_error: ThetaDataRequestError | None = None
        for _ in range(7):
            if candidate.weekday() < 5:
                try:
                    records, spot = self._fetch_historical_records(symbol, candidate.isoformat())
                    if records:
                        return records, spot
                except ThetaDataRequestError as exc:
                    if exc.status_code not in {400, 404}:
                        raise
                    last_error = exc
            candidate -= timedelta(days=1)
        if last_error is not None:
            raise last_error
        return [], None

    def _fetch_spot(self, symbol: str, as_of: str, *, live: bool) -> float | None:
        if live:
            snapshot = self._optional_get("/stock/snapshot/ohlc", {"symbol": symbol})
            spot = _first_number(_flatten_response(snapshot), "close")
            if spot:
                return spot
        compact = as_of.replace("-", "")
        history = self._optional_get(
            "/stock/history/eod",
            {"symbol": symbol, "start_date": compact, "end_date": compact},
        )
        return _first_number(_flatten_response(history), "close")


def _response_message(response: httpx.Response) -> str:
    try:
        payload = response.json()
    except ValueError:
        return ""
    if not isinstance(payload, dict):
        return ""
    value = payload.get("message") or payload.get("error") or payload.get("detail")
    return str(value)[:240] if value else ""


def _flatten_response(payload: dict[str, Any]) -> Iterable[dict[str, Any]]:
    response = payload.get("response") or []
    if isinstance(response, dict):
        response = [response]
    if not isinstance(response, list):
        return
    for item in response:
        if not isinstance(item, dict):
            continue
        contract = item.get("contract")
        data = item.get("data")
        if isinstance(contract, dict) and data is not None:
            data_items = data if isinstance(data, list) else [data]
            for point in data_items:
                if isinstance(point, dict):
                    yield {**contract, **point}
        else:
            yield item


def _contract_key(item: dict[str, Any]) -> tuple[str, float, str] | None:
    expiration = _format_date(item.get("expiration"))
    strike = _maybe_float(item.get("strike"))
    right = str(item.get("right") or item.get("call_put") or "").upper()
    if not expiration or strike is None or not right:
        return None
    return expiration, strike, right


def _merge_contract_records(*groups: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[tuple[str, float, str], dict[str, Any]] = {}
    for group in groups:
        for item in group:
            key = _contract_key(item)
            if key is None:
                continue
            current = merged.setdefault(key, {})
            current.update({name: value for name, value in item.items() if value is not None})
    return list(merged.values())


def _quotes_from_records(symbol: str, records: Iterable[dict[str, Any]]) -> list[OptionQuote]:
    quotes: list[OptionQuote] = []
    for item in records:
        key = _contract_key(item)
        if key is None:
            continue
        expiration, strike, right = key
        bid = float(item.get("bid", 0) or 0)
        ask = float(item.get("ask", 0) or 0)
        fallback = float(item.get("close", 0) or 0)
        mid = (bid + ask) / 2 if bid > 0 or ask > 0 else fallback
        quotes.append(
            OptionQuote(
                symbol=f"{symbol}-{expiration}-{right[0]}-{strike:g}",
                underlying=symbol,
                expiration=expiration,
                strike=strike,
                right=right.lower(),
                bid=bid,
                ask=ask,
                mid=mid,
                implied_vol=_maybe_float(item.get("implied_vol") or item.get("iv")),
                delta=_maybe_float(item.get("delta")),
                open_interest=_maybe_float(item.get("open_interest")),
                volume=_maybe_float(item.get("volume")),
            )
        )
    quotes.sort(key=lambda quote: (quote.expiration, quote.strike, quote.right))
    return quotes


def _first_number(records: Iterable[dict[str, Any]], field: str) -> float | None:
    for item in records:
        value = _maybe_float(item.get(field))
        if value is not None and value > 0:
            return value
    return None


def _records_as_of(records: Iterable[dict[str, Any]]) -> str | None:
    dates: list[str] = []
    for item in records:
        value = item.get("created") or item.get("timestamp") or item.get("last_trade")
        if value:
            dates.append(str(value)[:10])
    return max(dates) if dates else None


def _chain_from_cached(symbol: str, as_of: str, cached: list[dict[str, Any]]) -> OptionsChain:
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
    source_as_of = str(cached[0].get("source_as_of") or as_of) if cached else as_of
    return OptionsChain(
        underlying=symbol,
        as_of=source_as_of,
        spot=float(spot) if spot not in (None, "") else None,
        quotes=quotes,
        provider="thetadata",
    )


def _quote_cache_row(quote: OptionQuote, spot: float | None, source_as_of: str) -> dict[str, Any]:
    return {
        "spot": spot,
        "source_as_of": source_as_of,
        "symbol": quote.symbol,
        "underlying": quote.underlying,
        "expiration": quote.expiration,
        "strike": quote.strike,
        "right": quote.right,
        "bid": quote.bid,
        "ask": quote.ask,
        "mid": quote.mid,
        "implied_vol": quote.implied_vol,
        "delta": quote.delta,
        "open_interest": quote.open_interest,
        "volume": quote.volume,
    }


def _bar_from_row(row: dict[str, Any]) -> EquityBar:
    return EquityBar(
        date=str(row["date"]),
        open=float(row["open"]),
        high=float(row["high"]),
        low=float(row["low"]),
        close=float(row["close"]),
        volume=float(row.get("volume", 0)),
    )


def _maybe_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    return float(value)


def _format_date(value: Any) -> str:
    if value is None:
        return ""
    text = str(value)
    if len(text) == 8 and text.isdigit():
        return f"{text[0:4]}-{text[4:6]}-{text[6:8]}"
    return text[:10]


def _is_recent(as_of: str) -> bool:
    try:
        return abs((date.today() - date.fromisoformat(as_of[:10])).days) <= 7
    except ValueError:
        return False
