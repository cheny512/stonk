from __future__ import annotations

import csv
import json
import os
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from .config import data_dir
from .data import PriceRow, load_price_csv

SP500_DIR_NAME = "sp500"
MANIFEST_NAME = "manifest.json"
YEARS_DEFAULT = 10


def sp500_dir() -> Path:
    path = data_dir() / "equity" / SP500_DIR_NAME
    path.mkdir(parents=True, exist_ok=True)
    return path


def custom_dir() -> Path:
    path = data_dir() / "equity" / "custom"
    path.mkdir(parents=True, exist_ok=True)
    return path


def manifest_path() -> Path:
    return sp500_dir() / MANIFEST_NAME


def _tickers_file() -> Path:
    return Path(__file__).with_name("sp500_tickers.txt")


def get_sp500_tickers() -> list[str]:
    path = _tickers_file()
    if path.exists():
        tickers = [line.strip().upper() for line in path.read_text().splitlines() if line.strip()]
        if tickers:
            return tickers
    return _fetch_sp500_from_wikipedia()


def _fetch_sp500_constituents() -> list[str]:
    import httpx

    url = "https://raw.githubusercontent.com/datasets/s-and-p-500-companies/master/data/constituents.csv"
    with httpx.Client(timeout=60.0, follow_redirects=True) as client:
        response = client.get(url, headers={"User-Agent": "stonk-research/1.0"})
        response.raise_for_status()
    reader = csv.DictReader(response.text.splitlines())
    tickers = [row["Symbol"].strip().upper().replace(".", "-") for row in reader if row.get("Symbol")]
    if not tickers:
        raise RuntimeError("Failed to parse S&P 500 constituents CSV")
    _tickers_file().write_text("\n".join(tickers) + "\n")
    return tickers


def _fetch_sp500_from_wikipedia() -> list[str]:
    return _fetch_sp500_constituents()


def ticker_csv_path(ticker: str) -> Path:
    return sp500_dir() / f"{ticker.upper()}.csv"


def _write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["Date", "Open", "High", "Low", "Close", "Volume"])
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def download_ticker_history(ticker: str, years: int = YEARS_DEFAULT) -> Path:
    from .live_data import fetch_ticker_history

    result = fetch_ticker_history(ticker, years=years, provider="auto")
    return Path(result["path"])


def load_ticker_rows(ticker: str) -> list[PriceRow]:
    symbol = ticker.upper()
    if os.environ.get("STONK_USE_SQLITE") == "1":
        from market_predictor.db.engine import get_engine, get_session_factory
        from market_predictor.db.repo import get_bars
        engine = get_engine()
        try:
            session_factory = get_session_factory(engine)
            with session_factory() as session:
                rows = get_bars(session, symbol)
                if rows:
                    return rows
        finally:
            engine.dispose()
    
    for path in (ticker_csv_path(symbol), custom_dir() / f"{symbol}.csv"):
        if path.exists():
            return load_price_csv(path)
    raise FileNotFoundError(
        f"No data for {symbol}. Load the ticker from Stock Test or download S&P 500 data."
    )


def _manifest() -> dict[str, Any]:
    if manifest_path().exists():
        return json.loads(manifest_path().read_text())
    return {"tickers": {}, "years": YEARS_DEFAULT, "updated": None}


def _save_manifest(manifest: dict[str, Any]) -> None:
    manifest_path().write_text(json.dumps(manifest, indent=2, sort_keys=True))


def refresh_manifest_entry(ticker: str, error: str | None = None) -> None:
    manifest = _manifest()
    tickers = manifest.setdefault("tickers", {})
    path = ticker_csv_path(ticker)
    if path.exists() and not error:
        try:
            rows = load_price_csv(path)
            tickers[ticker.upper()] = {
                "rows": len(rows),
                "start": rows[0].date,
                "end": rows[-1].date,
                "path": str(path.relative_to(data_dir())),
                "error": None,
            }
        except Exception as exc:
            tickers[ticker.upper()] = {"rows": 0, "error": str(exc)}
    else:
        tickers[ticker.upper()] = {"rows": 0, "error": error or "missing"}
    manifest["updated"] = date.today().isoformat()
    _save_manifest(manifest)


def download_universe(
    tickers: list[str] | None = None,
    years: int = YEARS_DEFAULT,
    limit: int | None = None,
) -> dict[str, Any]:
    symbols = tickers or get_sp500_tickers()
    if limit is not None:
        symbols = symbols[:limit]
    ok: list[str] = []
    failed: dict[str, str] = {}
    for symbol in symbols:
        try:
            download_ticker_history(symbol, years=years)
            refresh_manifest_entry(symbol)
            ok.append(symbol)
        except Exception as exc:
            failed[symbol] = str(exc)
            refresh_manifest_entry(symbol, error=str(exc))
    manifest = _manifest()
    manifest["years"] = years
    _save_manifest(manifest)
    return {"downloaded": len(ok), "failed": failed, "ok": ok}


def list_universe(only_ready: bool = False) -> list[dict[str, Any]]:
    manifest = _manifest()
    tickers = manifest.get("tickers") or {}
    if not tickers:
        for path in sorted(sp500_dir().glob("*.csv")):
            refresh_manifest_entry(path.stem.upper())
        manifest = _manifest()
        tickers = manifest.get("tickers") or {}

    # Include ad-hoc custom tickers
    for path in sorted(custom_dir().glob("*.csv")):
        symbol = path.stem.upper()
        if symbol not in tickers:
            try:
                rows = load_price_csv(path)
                tickers[symbol] = {
                    "rows": len(rows),
                    "start": rows[0].date,
                    "end": rows[-1].date,
                    "error": None,
                }
            except Exception as exc:
                tickers[symbol] = {"rows": 0, "error": str(exc)}

    universe: list[dict[str, Any]] = []
    for ticker in sorted(tickers):
        meta = tickers[ticker]
        if only_ready and (meta.get("error") or (meta.get("rows") or 0) < 90):
            continue
        universe.append(
            {
                "ticker": ticker,
                "rows": meta.get("rows", 0),
                "start": meta.get("start"),
                "end": meta.get("end"),
                "error": meta.get("error"),
                "ready": not meta.get("error") and (meta.get("rows") or 0) >= 90,
            }
        )
    return universe


def load_datasets(tickers: list[str]) -> list[dict[str, Any]]:
    datasets: list[dict[str, Any]] = []
    for ticker in tickers:
        rows = load_ticker_rows(ticker)
        datasets.append({"ticker": ticker.upper(), "rows": rows, "kind": "S&P 500 CSV"})
    return datasets
