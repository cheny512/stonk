from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Literal

from .data_providers.router import fetch_equity_bars as _fetch_equity_bars
from .data_providers.router import fetch_options_chain as _fetch_options_chain
from .data_providers.types import EquityBar, OptionsChain


@dataclass(frozen=True)
class PriceRow:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float
    extras: dict[str, float]


def _float(value: str | None, default: float = 0.0) -> float:
    if value is None:
        return default
    value = value.strip()
    if value == "":
        return default
    return float(value.replace(",", ""))


def load_price_csv(path: str | Path) -> list[PriceRow]:
    rows: list[PriceRow] = []
    with Path(path).open(newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise ValueError("CSV has no header")
        fields = {name.lower(): name for name in reader.fieldnames}
        if "date" not in fields:
            raise ValueError("Price CSV must contain a Date column")
        close_name = fields.get("adj close") or fields.get("close")
        if not close_name:
            raise ValueError("Price CSV must contain Close or Adj Close")

        for raw in reader:
            close = _float(raw.get(close_name))
            open_ = _float(raw.get(fields.get("open", "")), close)
            high = _float(raw.get(fields.get("high", "")), max(open_, close))
            low = _float(raw.get(fields.get("low", "")), min(open_, close))
            volume = _float(raw.get(fields.get("volume", "")), 0.0)
            extras: dict[str, float] = {}
            for key, value in raw.items():
                if key is None or key.lower() in {"date", "open", "high", "low", "close", "adj close", "volume"}:
                    continue
                try:
                    extras[key] = _float(value)
                except ValueError:
                    continue
            rows.append(
                PriceRow(
                    date=raw[fields["date"]].strip(),
                    open=open_,
                    high=high,
                    low=low,
                    close=close,
                    volume=volume,
                    extras=extras,
                )
            )
    rows.sort(key=lambda row: row.date)
    if len(rows) < 90:
        raise ValueError("Need at least 90 daily rows for a useful model")
    return rows


def load_event_csv(path: str | Path) -> dict[str, dict[str, float]]:
    events: dict[str, dict[str, float]] = {}
    with Path(path).open(newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or "Date" not in reader.fieldnames:
            raise ValueError("Event CSV must contain a Date column")
        for raw in reader:
            date = raw["Date"].strip()
            values: dict[str, float] = {}
            for key, value in raw.items():
                if key == "Date":
                    continue
                try:
                    values[key] = _float(value)
                except ValueError:
                    continue
            events[date] = values
    return events


def attach_events(rows: Iterable[PriceRow], events: dict[str, dict[str, float]]) -> list[PriceRow]:
    merged: list[PriceRow] = []
    for row in rows:
        extra = dict(row.extras)
        extra.update(events.get(row.date, {}))
        merged.append(
            PriceRow(
                date=row.date,
                open=row.open,
                high=row.high,
                low=row.low,
                close=row.close,
                volume=row.volume,
                extras=extra,
            )
        )
    return merged


def equity_bars_to_price_rows(bars: Iterable[EquityBar]) -> list[PriceRow]:
    return [
        PriceRow(
            date=bar.date,
            open=bar.open,
            high=bar.high,
            low=bar.low,
            close=bar.close,
            volume=bar.volume,
            extras={},
        )
        for bar in bars
    ]


def load_equity_from_provider(
    ticker: str,
    start: str,
    end: str,
    *,
    mode: Literal["auto", "training", "live"] = "auto",
) -> list[PriceRow]:
    """Fetch OHLCV via Polygon (recent) or ThetaData (historical training)."""
    bars = _fetch_equity_bars(ticker, start, end, mode=mode)
    rows = equity_bars_to_price_rows(bars)
    if len(rows) < 90:
        raise ValueError("Need at least 90 daily rows for a useful model")
    return rows


def load_options_chain(
    ticker: str,
    as_of: str,
    *,
    mode: Literal["auto", "training", "live"] = "auto",
) -> OptionsChain:
    return _fetch_options_chain(ticker, as_of, mode=mode)

