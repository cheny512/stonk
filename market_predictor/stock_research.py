from __future__ import annotations

import math
import re
from datetime import date, datetime, timezone
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


def _simple_moving_average(rows: list[PriceRow], days: int) -> float | None:
    if len(rows) < days:
        return None
    return _mean([row.close for row in rows[-days:]])


def _rsi(rows: list[PriceRow], days: int = 14) -> float | None:
    changes = [rows[i].close - rows[i - 1].close for i in range(1, len(rows))]
    if len(changes) < days:
        return None
    recent = changes[-days:]
    average_gain = _mean([max(change, 0.0) for change in recent]) or 0.0
    average_loss = _mean([max(-change, 0.0) for change in recent]) or 0.0
    if average_loss == 0:
        return 100.0 if average_gain > 0 else 50.0
    relative_strength = average_gain / average_loss
    return 100.0 - (100.0 / (1.0 + relative_strength))


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
    sma20 = _simple_moving_average(rows, 20)
    sma50 = _simple_moving_average(rows, 50)
    sma200 = _simple_moving_average(rows, 200)
    rsi14 = _rsi(rows, 14)
    relative_volume = latest_volume / avg_volume_20 if avg_volume_20 else None
    trend = "mixed"
    if sma20 is not None and sma50 is not None:
        trend = "uptrend" if latest.close > sma20 > sma50 else "downtrend" if latest.close < sma20 < sma50 else "mixed"

    observations: list[str] = []
    if sma50 is not None:
        direction = "above" if latest.close >= sma50 else "below"
        observations.append(f"Price is {direction} its 50-day average.")
    if rsi14 is not None:
        condition = "elevated" if rsi14 >= 70 else "depressed" if rsi14 <= 30 else "neutral"
        observations.append(f"14-day RSI is {condition} at {rsi14:.1f}.")
    if relative_volume is not None:
        observations.append(f"Latest volume is {relative_volume:.1f}x its 20-day average.")

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
            "relativeVolume20d": relative_volume,
            "volumeTrend20v60": avg_volume_20 / avg_volume_60 - 1.0 if avg_volume_20 and avg_volume_60 else None,
            "upVolume20d": up_volume,
            "downVolume20d": down_volume,
            "buyPressure20d": up_volume / volume_total if volume_total else None,
        },
        "indicators": {
            "sma20": sma20,
            "sma50": sma50,
            "sma200": sma200,
            "rsi14": rsi14,
            "relativeVolume": relative_volume,
            "trend": trend,
        },
        "analysis": {
            "trend": trend,
            "observations": observations,
            "methodology": "Deterministic calculations from adjusted daily OHLCV history; no AI-generated prices.",
        },
    }


def _news_time(value: Any) -> str | None:
    if isinstance(value, dict):
        value = value.get("raw") or value.get("fmt")
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value, tz=timezone.utc).date().isoformat()
    if isinstance(value, str) and value:
        return value[:10]
    return None


def _news_publisher(item: dict[str, Any]) -> str | None:
    publisher = item.get("publisher") or item.get("provider") or item.get("source")
    if isinstance(publisher, dict):
        return publisher.get("displayName") or publisher.get("name")
    if isinstance(publisher, str):
        return publisher
    return None


def _news_url(item: dict[str, Any]) -> str | None:
    link = item.get("canonicalUrl") or item.get("clickThroughUrl") or item.get("link") or item.get("url")
    if isinstance(link, dict):
        link = link.get("url")
    if isinstance(link, str):
        return link
    return None


_COMPANY_SUFFIXES = {
    "co",
    "company",
    "corp",
    "corporation",
    "group",
    "holdings",
    "inc",
    "incorporated",
    "limited",
    "ltd",
    "plc",
}


def _company_relevance_terms(company_name: str | None) -> set[str]:
    if not company_name:
        return set()
    base_name = re.sub(
        r"\b(?:co|company|corp|corporation|group|holdings|inc|incorporated|limited|ltd|plc)\.?\b",
        "",
        company_name,
        flags=re.IGNORECASE,
    ).strip(" ,.-").lower()
    words = [word.lower() for word in re.findall(r"[A-Za-z0-9]+", company_name)]
    meaningful = [word for word in words if word not in _COMPANY_SUFFIXES and len(word) >= 3]
    terms: set[str] = set()
    if len(base_name) >= 3:
        terms.add(base_name)
    if meaningful:
        terms.add(meaningful[0])
    if len(meaningful) >= 2:
        terms.add(" ".join(meaningful[:2]))
    if len(meaningful) >= 3:
        terms.add(" ".join(meaningful[:3]))
    return terms


def _news_relevance(ticker: str, company_name: str | None, title: str, summary: str | None) -> str | None:
    symbol = ticker.strip().upper()
    text = f"{title} {summary or ''}"
    if len(symbol) <= 2:
        symbol_pattern = rf"(?:\${re.escape(symbol)}\b|\b(?:NYSE|NASDAQ)\s*:\s*{re.escape(symbol)}\b|\({re.escape(symbol)}\))"
    else:
        symbol_pattern = rf"(?<![A-Z0-9])\$?{re.escape(symbol)}(?![A-Z0-9])"
    if re.search(symbol_pattern, text, flags=re.IGNORECASE):
        return "ticker"
    lowered = text.lower()
    if any(re.search(rf"\b{re.escape(term)}\b", lowered) for term in _company_relevance_terms(company_name)):
        return "company"
    return None


def fetch_current_events(ticker: str, limit: int = 8, company_name: str | None = None) -> dict[str, Any]:
    retrieved_at = datetime.now(timezone.utc).isoformat()
    try:
        import yfinance as yf

        raw_news = yf.Ticker(ticker).news or []
    except Exception as exc:
        return {
            "available": False,
            "message": str(exc),
            "provider": "yfinance",
            "retrievedAt": retrieved_at,
            "items": [],
        }

    items: list[dict[str, Any]] = []
    inspected = 0
    for item in raw_news[: max(limit * 4, 32)]:
        inspected += 1
        content = item.get("content") if isinstance(item.get("content"), dict) else item
        title = content.get("title") or item.get("title")
        if not title:
            continue
        summary = content.get("summary") or content.get("description") or item.get("summary")
        relevance = _news_relevance(ticker, company_name, str(title), summary)
        if relevance is None:
            continue
        items.append(
            {
                "title": title,
                "publisher": _news_publisher(content) or _news_publisher(item),
                "published": _news_time(
                    content.get("pubDate")
                    or content.get("providerPublishTime")
                    or item.get("providerPublishTime")
                    or item.get("pubDate")
                ),
                "url": _news_url(content) or _news_url(item),
                "summary": summary,
                "relevance": relevance,
            }
        )
        if len(items) >= limit:
            break

    return {
        "available": bool(items),
        "provider": "yfinance",
        "retrievedAt": retrieved_at,
        "items": items,
        "discardedCount": max(0, inspected - len(items)),
        "relevanceMethod": "Ticker or company-name match in the headline or summary.",
        "message": "" if items else "No recent ticker-specific current events passed the relevance check.",
    }


def fetch_fundamentals(ticker: str) -> dict[str, Any]:
    retrieved_at = datetime.now(timezone.utc).isoformat()
    try:
        import yfinance as yf

        info = yf.Ticker(ticker).get_info()
    except Exception as exc:
        return {"available": False, "message": str(exc), "provider": "yfinance", "retrievedAt": retrieved_at}

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
        "retrievedAt": retrieved_at,
        "name": info.get("shortName") or info.get("longName") or ticker.upper(),
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "website": info.get("website"),
        "metrics": {name: _number(info.get(source)) for name, source in keys.items()},
    }


def build_stock_research(ticker: str, rows: list[PriceRow], include_fundamentals: bool = True) -> dict[str, Any]:
    generated_at = datetime.now(timezone.utc).isoformat()
    fundamentals = fetch_fundamentals(ticker) if include_fundamentals else {"available": False}
    return {
        "ticker": ticker.upper(),
        "schemaVersion": "1.0",
        "generatedAt": generated_at,
        "dataAsOf": rows[-1].date,
        "provenance": {
            "price": "stored adjusted daily OHLCV",
            "calculations": "stonk deterministic research engine",
            "freshnessWarning": "Daily and aggregated feeds may be delayed; verify before acting.",
        },
        **build_history_summary(rows),
        "fundamentals": fundamentals,
        "events": fetch_current_events(ticker, company_name=fundamentals.get("name")),
    }
