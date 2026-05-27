from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path
from typing import Any, Literal

from .config import massive_api_key, thetadata_password, thetadata_username
from .data import PriceRow, load_price_csv
from .universe import YEARS_DEFAULT, _write_csv, custom_dir, sp500_dir

ProviderName = Literal["polygon", "yfinance"]


def resolve_csv_path(ticker: str) -> Path | None:
    symbol = ticker.upper()
    for path in (sp500_dir() / f"{symbol}.csv", custom_dir() / f"{symbol}.csv"):
        if path.exists():
            return path
    return None


def load_ticker_rows(ticker: str) -> list[PriceRow]:
    from .universe import load_ticker_rows as _load

    return _load(ticker)


def list_available_providers() -> dict[str, Any]:
    massive = bool(massive_api_key())
    return {
        "massive": {
            "configured": massive,
            "role": "Live/recent US equities and options (Massive.com, formerly Polygon)",
            "docs": "https://massive.com/docs/rest/stocks/overview",
        },
        "polygon": {"configured": massive, "role": "Alias for Massive (use MASSIVE_API_KEY)"},
        "yfinance": {"configured": True, "role": "Free delayed daily bars for any symbol (no key)"},
        "thetadata": {
            "configured": bool(thetadata_username() and thetadata_password()),
            "role": "Deep historical options for training",
        },
        "default_equity": "massive" if massive else "yfinance",
    }


def _save_rows(ticker: str, rows: list[dict[str, Any]], provider: ProviderName) -> Path:
    from .universe import get_sp500_tickers

    symbol = ticker.upper()
    # If already in sp500_dir or is an S&P 500 ticker, save there.
    if (sp500_dir() / f"{symbol}.csv").exists() or symbol in get_sp500_tickers():
        path = sp500_dir() / f"{symbol}.csv"
    else:
        path = custom_dir() / f"{symbol}.csv"
    _write_csv(path, rows)
    return path


def _rows_from_yfinance(ticker: str, years: int) -> tuple[list[dict[str, Any]], ProviderName]:
    import yfinance as yf

    symbol = ticker.upper().replace(".", "-")
    end = date.today()
    start = end - timedelta(days=365 * years + 30)
    frame = yf.download(
        symbol,
        start=start.isoformat(),
        end=end.isoformat(),
        interval="1d",
        auto_adjust=True,
        progress=False,
        threads=False,
    )
    if frame is None or frame.empty:
        raise ValueError(f"No data returned for {ticker}")
    if hasattr(frame.columns, "nlevels") and frame.columns.nlevels > 1:
        frame.columns = [str(col[0]).title() if isinstance(col, tuple) else str(col) for col in frame.columns]
    frame = frame.rename(columns={c: c.title() for c in frame.columns})
    rows: list[dict[str, Any]] = []
    for idx, row in frame.iterrows():
        day = idx.date() if hasattr(idx, "date") else date.fromisoformat(str(idx)[:10])
        close = float(row["Close"])
        if close <= 0:
            continue
        rows.append(
            {
                "Date": day.isoformat(),
                "Open": float(row.get("Open", close)),
                "High": float(row.get("High", close)),
                "Low": float(row.get("Low", close)),
                "Close": close,
                "Volume": int(float(row.get("Volume", 0) or 0)),
            }
        )
    if len(rows) < 90:
        raise ValueError(f"Insufficient history for {ticker}: {len(rows)} rows")
    return rows, "yfinance"


def _rows_from_polygon(ticker: str, years: int) -> tuple[list[dict[str, Any]], ProviderName]:
    from .data_providers.polygon import PolygonProvider

    end = date.today()
    start = end - timedelta(days=365 * years + 30)
    provider = PolygonProvider()
    bars = provider.fetch_equity_bars(ticker, start.isoformat(), end.isoformat())
    if len(bars) < 90:
        raise ValueError(f"Insufficient Polygon history for {ticker}")
    return [
        {
            "Date": b.date,
            "Open": b.open,
            "High": b.high,
            "Low": b.low,
            "Close": b.close,
            "Volume": int(b.volume),
        }
        for b in bars
    ], "massive"


def fetch_ticker_history(
    ticker: str,
    years: int = YEARS_DEFAULT,
    provider: Literal["auto", "polygon", "yfinance"] = "auto",
) -> dict[str, Any]:
    """Download/update daily OHLCV CSV for any US-style ticker."""
    symbol = ticker.upper()
    chosen: ProviderName
    rows: list[dict[str, Any]]
    if provider in ("polygon", "massive") or (provider == "auto" and massive_api_key()):
        try:
            rows, chosen = _rows_from_polygon(symbol, years)
        except Exception:
            if provider in ("polygon", "massive"):
                raise
            rows, chosen = _rows_from_yfinance(symbol, years)
    else:
        rows, chosen = _rows_from_yfinance(symbol, years)

    path = _save_rows(symbol, rows, chosen)
    price_rows = load_price_csv(path)
    return {
        "ticker": symbol,
        "provider": chosen,
        "path": str(path),
        "rows": len(price_rows),
        "start": price_rows[0].date,
        "end": price_rows[-1].date,
    }


def get_live_quote(ticker: str) -> dict[str, Any]:
    """Best-effort latest price; Polygon if configured else yfinance."""
    symbol = ticker.upper().replace(".", "-")
    if massive_api_key():
        try:
            return _massive_quote(symbol)
        except Exception:
            pass
    return _yfinance_quote(symbol)


def _massive_quote(symbol: str) -> dict[str, Any]:
    from .data_providers.polygon import PolygonProvider

    provider = PolygonProvider()
    trade = provider.last_trade(symbol)
    snap = provider.snapshot_ticker(symbol)
    day = snap.get("day") or {}
    last = snap.get("lastTrade") or {}
    price = float(trade.get("p") or last.get("p") or day.get("c") or 0)
    return {
        "ticker": symbol,
        "provider": "massive",
        "price": price,
        "open": float(day.get("o") or 0),
        "high": float(day.get("h") or 0),
        "low": float(day.get("l") or 0),
        "volume": float(day.get("v") or trade.get("s") or 0),
        "asOf": date.today().isoformat(),
        "delayed": False,
    }


def _yfinance_quote(symbol: str) -> dict[str, Any]:
    import yfinance as yf

    tick = yf.Ticker(symbol)
    hist = tick.history(period="5d", interval="1d", auto_adjust=True)
    if hist is None or hist.empty:
        raise ValueError(f"No live quote for {symbol}")
    last = hist.iloc[-1]
    idx = hist.index[-1]
    as_of = idx.date().isoformat() if hasattr(idx, "date") else str(idx)[:10]
    return {
        "ticker": symbol,
        "provider": "yfinance",
        "price": float(last["Close"]),
        "open": float(last["Open"]),
        "high": float(last["High"]),
        "low": float(last["Low"]),
        "volume": float(last.get("Volume", 0) or 0),
        "asOf": as_of,
        "delayed": True,
    }


def index_for_date(rows: list[PriceRow], as_of: str) -> int:
    matches = [i for i, row in enumerate(rows) if row.date == as_of]
    if matches:
        return matches[-1]
    # nearest prior date
    prior = [i for i, row in enumerate(rows) if row.date <= as_of]
    if not prior:
        raise ValueError(f"No data on or before {as_of}")
    return prior[-1]
