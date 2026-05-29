from __future__ import annotations

import math
from datetime import date
from typing import Any

from .data import PriceRow


def _pct_change(rows: list[PriceRow], days: int) -> float | None:
    if len(rows) <= days:
        return None
    start = rows[-1 - days].close
    if start <= 0:
        return None
    return rows[-1].close / start - 1.0


def _returns(rows: list[PriceRow]) -> list[float]:
    values: list[float] = []
    for i in range(1, len(rows)):
        previous = rows[i - 1].close
        values.append(0.0 if previous <= 0 else rows[i].close / previous - 1.0)
    return values


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def _stdev(values: list[float]) -> float | None:
    if len(values) < 2:
        return None
    avg = sum(values) / len(values)
    return math.sqrt(sum((value - avg) ** 2 for value in values) / (len(values) - 1))


def _realized_vol(daily_returns: list[float], days: int) -> float | None:
    sd = _stdev(daily_returns[-days:])
    return sd * math.sqrt(252) if sd is not None else None


def _avg_true_range(rows: list[PriceRow], days: int = 14) -> float | None:
    if len(rows) < 2:
        return None
    values: list[float] = []
    for i in range(max(1, len(rows) - days), len(rows)):
        row = rows[i]
        previous = rows[i - 1]
        if row.close <= 0:
            continue
        true_range = max(row.high - row.low, abs(row.high - previous.close), abs(row.low - previous.close))
        values.append(true_range / row.close)
    return _mean(values)


def _parse_day(value: str) -> date | None:
    try:
        return date.fromisoformat(value[:10])
    except ValueError:
        return None


def _ytd_return(rows: list[PriceRow]) -> float | None:
    latest_day = _parse_day(rows[-1].date)
    if latest_day is None:
        return None
    year_rows = [row for row in rows if (_parse_day(row.date) or date.min).year == latest_day.year]
    if len(year_rows) < 2 or year_rows[0].close <= 0:
        return None
    return rows[-1].close / year_rows[0].close - 1.0


def _number(value: Any) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return parsed if math.isfinite(parsed) else None


def build_history_summary(rows: list[PriceRow]) -> dict[str, Any]:
    daily_returns = _returns(rows)
    latest = rows[-1]
    year_rows = rows[-252:] if len(rows) >= 252 else rows
    high_52w = max(row.high for row in year_rows)
    low_52w = min(row.low for row in year_rows)
    avg_volume_20 = _mean([row.volume for row in rows[-20:]])
    avg_volume_60 = _mean([row.volume for row in rows[-60:]])
    latest_volume = latest.volume

    up_volume = 0.0
    down_volume = 0.0
    for i in range(max(1, len(rows) - 20), len(rows)):
      if rows[i].close >= rows[i - 1].close:
          up_volume += rows[i].volume
      else:
          down_volume += rows[i].volume
    volume_total = up_volume + down_volume

    return {
        "history": {
            "rows": len(rows),
            "start": rows[0].date,
            "end": latest.date,
            "lastClose": latest.close,
            "return5d": _pct_change(rows, 5),
            "return1m": _pct_change(rows, 21),
            "return3m": _pct_change(rows, 63),
            "return1y": _pct_change(rows, 252),
            "ytdReturn": _ytd_return(rows),
            "high52w": high_52w,
            "low52w": low_52w,
            "drawdownFrom52wHigh": latest.close / high_52w - 1.0 if high_52w else None,
            "distanceFrom52wLow": latest.close / low_52w - 1.0 if low_52w else None,
        },
        "volatility": {
            "realized20d": _realized_vol(daily_returns, 20),
            "realized60d": _realized_vol(daily_returns, 60),
            "realized1y": _realized_vol(daily_returns, 252),
            "atr14": _avg_true_range(rows, 14),
            "averageDailyMove20d": _mean([abs(value) for value in daily_returns[-20:]]),
        },
        "volume": {
            "latestVolume": latest_volume,
            "average20d": avg_volume_20,
            "average60d": avg_volume_60,
            "relativeVolume20d": latest_volume / avg_volume_20 if avg_volume_20 else None,
            "volumeTrend20v60": avg_volume_20 / avg_volume_60 - 1.0 if avg_volume_20 and avg_volume_60 else None,
            "upVolume20d": up_volume,
            "downVolume20d": down_volume,
            "buyPressure20d": up_volume / volume_total if volume_total else None,
        },
    }


def fetch_fundamentals(ticker: str) -> dict[str, Any]:
    try:
        import yfinance as yf

        info = yf.Ticker(ticker).get_info()
    except Exception as exc:
        return {"available": False, "message": str(exc), "provider": "yfinance"}

    keys = {
        "marketCap": "marketCap",
        "enterpriseValue": "enterpriseValue",
        "trailingPE": "trailingPE",
        "forwardPE": "forwardPE",
        "priceToSales": "priceToSalesTrailing12Months",
        "priceToBook": "priceToBook",
        "revenueGrowth": "revenueGrowth",
        "earningsGrowth": "earningsGrowth",
        "grossMargins": "grossMargins",
        "profitMargins": "profitMargins",
        "operatingMargins": "operatingMargins",
        "returnOnEquity": "returnOnEquity",
        "debtToEquity": "debtToEquity",
        "freeCashflow": "freeCashflow",
        "totalRevenue": "totalRevenue",
    }
    return {
        "available": True,
        "provider": "yfinance",
        "name": info.get("shortName") or info.get("longName") or ticker.upper(),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "website": info.get("website"),
        "metrics": {name: _number(info.get(source)) for name, source in keys.items()},
    }


def build_stock_research(ticker: str, rows: list[PriceRow], include_fundamentals: bool = True) -> dict[str, Any]:
    return {
        "ticker": ticker.upper(),
        **build_history_summary(rows),
        "fundamentals": fetch_fundamentals(ticker) if include_fundamentals else {"available": False},
    }
