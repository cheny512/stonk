from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from .data import PriceRow

INDICATOR_CATALOG: list[dict[str, str | float]] = [
    {"key": "earningsSurprise", "label": "Earnings surprise", "group": "Catalyst", "weight": 1.25},
    {"key": "revenueSurprise", "label": "Revenue surprise", "group": "Catalyst", "weight": 0.75},
    {"key": "guidanceRevision", "label": "Guidance revision", "group": "Catalyst", "weight": 1.1},
    {"key": "contractBacklog", "label": "Contract / backlog", "group": "Catalyst", "weight": 0.65},
    {"key": "newsSentiment", "label": "News / hype sentiment", "group": "Sentiment", "weight": 0.45},
    {"key": "ceoCredibility", "label": "CEO credibility", "group": "Sentiment", "weight": 0.22},
    {"key": "macroRates", "label": "Rates / macro shock", "group": "Macro", "weight": 0.72},
    {"key": "sectorRelativeStrength", "label": "Sector relative strength", "group": "Market", "weight": 0.86},
    {"key": "momentum5", "label": "5D momentum", "group": "Price", "weight": 1.05},
    {"key": "momentum20", "label": "20D momentum", "group": "Price", "weight": 1.18},
    {"key": "trend60", "label": "60D trend", "group": "Price", "weight": 0.88},
    {"key": "sma20Gap", "label": "20D SMA gap", "group": "Price", "weight": 0.72},
    {"key": "sma50Gap", "label": "50D SMA gap", "group": "Price", "weight": 0.64},
    {"key": "rsi14", "label": "RSI 14", "group": "Momentum", "weight": -0.42},
    {"key": "macdHistogram", "label": "MACD histogram", "group": "Momentum", "weight": 0.58},
    {"key": "realizedVol20", "label": "20D realized volatility", "group": "Risk", "weight": -0.55},
    {"key": "atr14", "label": "ATR 14", "group": "Risk", "weight": -0.36},
    {"key": "volumeShock20", "label": "20D volume shock", "group": "Volume", "weight": 0.34},
    {"key": "vwapDistance", "label": "VWAP distance", "group": "Volume", "weight": -0.46},
    {"key": "breakoutPosition", "label": "20D breakout position", "group": "Price", "weight": 0.7},
]

DEFAULT_CATALYSTS = {
    "earningsSurprise": 0.15,
    "revenueSurprise": 0.05,
    "guidanceRevision": 0.15,
    "contractBacklog": 0.0,
    "newsSentiment": 0.1,
    "ceoCredibility": 0.05,
    "macroRates": -0.1,
    "sectorRelativeStrength": 0.1,
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _stdev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    avg = _mean(values)
    var = sum((v - avg) ** 2 for v in values) / (len(values) - 1)
    return math.sqrt(max(var, 0.0))


def _returns(closes: list[float]) -> list[float]:
    out: list[float] = []
    for i in range(1, len(closes)):
        prev = closes[i - 1]
        out.append(0.0 if prev == 0 else closes[i] / prev - 1.0)
    return out


def _ema(values: list[float], period: int) -> float:
    if not values:
        return 0.0
    alpha = 2 / (period + 1)
    value = values[0]
    for i in range(1, len(values)):
        value = alpha * values[i] + (1 - alpha) * value
    return value


def _rsi(closes: list[float]) -> float:
    if len(closes) < 2:
        return 0.5
    gains = 0.0
    losses = 0.0
    for i in range(1, len(closes)):
        change = closes[i] - closes[i - 1]
        gains += max(change, 0.0)
        losses += max(-change, 0.0)
    if losses == 0:
        return 1.0
    rs = gains / losses
    return 1.0 - (1.0 / (1.0 + rs))


def _atr(rows: list[PriceRow]) -> float:
    if len(rows) < 2:
        return 0.0
    values: list[float] = []
    for i in range(1, len(rows)):
        row = rows[i]
        prev = rows[i - 1]
        if row.close == 0:
            continue
        values.append(
            max(row.high - row.low, abs(row.high - prev.close), abs(row.low - prev.close)) / row.close
        )
    return _mean(values)


def _rolling_vwap(rows: list[PriceRow]) -> float:
    vol = sum(r.volume for r in rows)
    if not vol:
        return rows[-1].close if rows else 0.0
    return sum(((r.high + r.low + r.close) / 3) * r.volume for r in rows) / vol


def rows_to_dicts(rows: list[PriceRow]) -> list[dict[str, Any]]:
    return [
        {
            "date": r.date,
            "open": r.open,
            "high": r.high,
            "low": r.low,
            "close": r.close,
            "volume": r.volume,
        }
        for r in rows
    ]


def feature_at(rows: list[PriceRow], index: int, catalysts: dict[str, float]) -> dict[str, float]:
    slice_rows = rows[: index + 1]
    closes = [r.close for r in slice_rows]
    volumes = [r.volume for r in slice_rows]
    daily = _returns(closes)
    latest = rows[index]

    def ret(days: int) -> float:
        return closes[-1] / closes[-1 - days] - 1.0 if len(closes) > days else 0.0

    vol20 = _stdev(daily[-20:]) * math.sqrt(252)
    vol_window = volumes[-20:]
    volume_shock = 0.0
    if len(vol_window) >= 5:
        sd = _stdev(vol_window)
        volume_shock = 0.0 if sd == 0 else (volumes[-1] - _mean(vol_window)) / sd

    sma20 = _mean(closes[-20:])
    sma50 = _mean(closes[-50:])
    sma60 = _mean(closes[-60:])
    highs_20 = [r.high for r in slice_rows[-20:]]
    lows_20 = [r.low for r in slice_rows[-20:]]
    high20 = max(highs_20) if highs_20 else latest.close
    low20 = min(lows_20) if lows_20 else latest.close
    close_position = 0.5 if high20 == low20 else (latest.close - low20) / (high20 - low20)
    macd = _ema(closes[-80:], 12) - _ema(closes[-80:], 26)
    signal = _ema(daily[-80:] + [macd], 9)
    vwap = _rolling_vwap(slice_rows[-20:])
    earnings = latest.extras.get("earnings_surprise", latest.extras.get("earnings", 0.0))
    prev = rows[max(0, index - 1)]
    prev_earnings = prev.extras.get("earnings_surprise", prev.extras.get("earnings", 0.0))
    earnings_momentum = (
        (earnings - prev_earnings) / abs(prev_earnings) if earnings and prev_earnings else 0.0
    )
    rate = latest.extras.get("rate_shock", latest.extras.get("rate", 0.0))

    return {
        "earningsSurprise": _clamp(catalysts.get("earningsSurprise", 0.0) + earnings_momentum, -1, 1),
        "revenueSurprise": catalysts.get("revenueSurprise", 0.0),
        "guidanceRevision": catalysts.get("guidanceRevision", 0.0),
        "contractBacklog": catalysts.get("contractBacklog", 0.0),
        "newsSentiment": catalysts.get("newsSentiment", 0.0),
        "ceoCredibility": catalysts.get("ceoCredibility", 0.0),
        "macroRates": _clamp(catalysts.get("macroRates", 0.0) + (-rate / 100 if rate else 0.0), -1, 1),
        "sectorRelativeStrength": catalysts.get("sectorRelativeStrength", 0.0),
        "momentum5": _clamp(ret(5) * 8, -1, 1),
        "momentum20": _clamp(ret(20) * 5, -1, 1),
        "trend60": _clamp((latest.close / max(0.0001, sma60) - 1) * 4, -1, 1),
        "sma20Gap": _clamp((latest.close / max(0.0001, sma20) - 1) * 8, -1, 1),
        "sma50Gap": _clamp((latest.close / max(0.0001, sma50) - 1) * 5, -1, 1),
        "rsi14": _rsi(closes[-15:]) - 0.5,
        "macdHistogram": _clamp(macd - signal, -1, 1),
        "realizedVol20": _clamp(vol20, 0, 1),
        "atr14": _clamp(_atr(slice_rows[-15:]) * 10, 0, 1),
        "volumeShock20": _clamp(volume_shock / 5, -1, 1),
        "vwapDistance": _clamp((latest.close / max(0.0001, vwap) - 1) * 8, -1, 1),
        "breakoutPosition": close_position - 0.5,
    }


def _sigmoid(value: float) -> float:
    value = _clamp(value, -35, 35)
    return 1.0 / (1.0 + math.exp(-value))


def score_features(features: dict[str, float], settings: dict[str, dict[str, Any]]) -> tuple[float, float]:
    active = 0.0
    total_weight = 0.0
    for item in INDICATOR_CATALOG:
        key = str(item["key"])
        setting = settings.get(key, {})
        if not setting.get("enabled", True):
            continue
        weight = float(setting.get("weight", item["weight"]))
        active += (features.get(key, 0.0) or 0.0) * weight
        total_weight += abs(weight)
    normalized = (active / total_weight) * 5 if total_weight else 0.0
    return _sigmoid(normalized), normalized


def correlation(x_values: list[float], y_values: list[float]) -> float:
    n = min(len(x_values), len(y_values))
    if n < 3:
        return 0.0
    x = x_values[:n]
    y = y_values[:n]
    x_avg = _mean(x)
    y_avg = _mean(y)
    covariance = 0.0
    x_var = 0.0
    y_var = 0.0
    for i in range(n):
        xd = x[i] - x_avg
        yd = y[i] - y_avg
        covariance += xd * yd
        x_var += xd * xd
        y_var += yd * yd
    denom = math.sqrt(x_var * y_var)
    return covariance / denom if denom else 0.0


def rank_indicators(
    datasets: list[dict[str, Any]],
    horizon: int,
    catalysts: dict[str, float],
    max_index_by_ticker: dict[str, int] | None = None,
) -> dict[str, Any]:
    max_index_by_ticker = max_index_by_ticker or {}
    samples = {str(item["key"]): {"x": [], "y": []} for item in INDICATOR_CATALOG}
    total_rows = 0
    for dataset in datasets:
        rows: list[PriceRow] = dataset["rows"]
        last_usable = min(
            len(rows) - horizon,
            max_index_by_ticker.get(dataset["ticker"], len(rows) - horizon),
        )
        for i in range(70, last_usable):
            features = feature_at(rows, i, catalysts)
            future_return = rows[i + horizon].close / rows[i].close - 1.0
            for item in INDICATOR_CATALOG:
                key = str(item["key"])
                samples[key]["x"].append(features.get(key, 0.0))
                samples[key]["y"].append(future_return)
            total_rows += 1

    rankings = []
    for item in INDICATOR_CATALOG:
        key = str(item["key"])
        corr = correlation(samples[key]["x"], samples[key]["y"])
        rankings.append(
            {
                **item,
                "correlation": corr,
                "strength": abs(corr),
                "sampleCount": len(samples[key]["x"]),
            }
        )
    rankings.sort(key=lambda row: row["strength"], reverse=True)
    return {"rankings": rankings, "totalRows": total_rows}


def train_settings_from_correlations(
    datasets: list[dict[str, Any]],
    horizon: int,
    catalysts: dict[str, float],
    max_index_by_ticker: dict[str, int] | None = None,
) -> dict[str, Any]:
    ranked = rank_indicators(datasets, horizon, catalysts, max_index_by_ticker)
    rankings = ranked["rankings"]
    strongest = max((row["strength"] for row in rankings), default=0.001) or 0.001
    settings: dict[str, dict[str, Any]] = {}
    for item in INDICATOR_CATALOG:
        key = str(item["key"])
        match = next((row for row in rankings if row["key"] == key), None)
        scaled = (match["correlation"] / strongest) * 1.5 if match else float(item["weight"])
        settings[key] = {
            "enabled": bool(match and match["sampleCount"] >= 50 and match["strength"] >= 0.01),
            "weight": _clamp(scaled, -3, 3),
        }
    return {"settings": settings, "rankings": rankings, "totalRows": ranked["totalRows"]}


def run_backtest(
    rows: list[PriceRow],
    horizon: int,
    confidence: float,
    settings: dict[str, dict[str, Any]],
    catalysts: dict[str, float],
    trade_cost: float,
    train_fraction: float,
) -> dict[str, Any]:
    if len(rows) < 90 + horizon:
        raise ValueError("Need more price rows for this horizon.")
    examples: list[dict[str, Any]] = []
    for i in range(70, len(rows) - horizon):
        features = feature_at(rows, i, catalysts)
        probability, raw = score_features(features, settings)
        realized = rows[i + horizon].close / rows[i].close - 1.0
        examples.append(
            {
                "date": rows[i].date,
                "probability": probability,
                "raw": raw,
                "realized": realized,
                "close": rows[i].close,
            }
        )
    split = int(len(examples) * train_fraction)
    test = examples[split:]
    correct = 0
    signal_hits = 0
    signal_count = 0
    gross_win = 0.0
    gross_loss = 0.0
    cumulative = 0.0
    peak = 0.0
    max_drawdown = 0.0
    trades: list[dict[str, Any]] = []
    for item in test:
        predicted_up = item["probability"] >= 0.5
        realized_up = item["realized"] > 0
        if predicted_up == realized_up:
            correct += 1
        is_long = item["probability"] >= confidence
        is_short = item["probability"] <= 1 - confidence
        if not is_long and not is_short:
            continue
        side = "long" if is_long else "short"
        pnl = (item["realized"] if is_long else -item["realized"]) - trade_cost
        signal_count += 1
        if (is_long and realized_up) or (is_short and not realized_up):
            signal_hits += 1
        if pnl >= 0:
            gross_win += pnl
        else:
            gross_loss += abs(pnl)
        cumulative += pnl
        peak = max(peak, cumulative)
        max_drawdown = max(max_drawdown, peak - cumulative)
        trades.append({**item, "side": side, "pnl": pnl})

    return {
        "testCount": len(test),
        "accuracy": correct / len(test) if test else 0.0,
        "hitRate": signal_hits / signal_count if signal_count else 0.0,
        "signalCount": signal_count,
        "expectancy": cumulative / signal_count if signal_count else 0.0,
        "cumulative": cumulative,
        "maxDrawdown": max_drawdown,
        "profitFactor": gross_win / gross_loss if gross_loss else (99.0 if gross_win else 0.0),
        "trades": trades,
    }


def coverage_label(rows: list[PriceRow]) -> str:
    if not rows:
        return "--"
    first = rows[0].date
    last = rows[-1].date
    has_volume = any(r.volume > 0 for r in rows)
    suffix = "" if has_volume else " · no volume/VWAP history"
    return f"{first} to {last}{suffix}"


def run_portfolio_backtest(
    datasets: list[dict[str, Any]],
    horizon: int,
    confidence: float,
    settings: dict[str, dict[str, Any]],
    catalysts: dict[str, float],
    trade_cost: float,
    train_fraction: float,
) -> dict[str, Any]:
    results = []
    totals = {
        "testCount": 0,
        "signalCount": 0,
        "weightedAccuracy": 0.0,
        "weightedHitRate": 0.0,
        "pnl": 0.0,
        "drawdown": 0.0,
    }
    for dataset in datasets:
        rows: list[PriceRow] = dataset["rows"]
        backtest = run_backtest(rows, horizon, confidence, settings, catalysts, trade_cost, train_fraction)
        results.append(
            {
                "ticker": dataset["ticker"],
                "rows": len(rows),
                "coverage": coverage_label(rows),
                "backtest": backtest,
            }
        )
        totals["testCount"] += backtest["testCount"]
        totals["signalCount"] += backtest["signalCount"]
        totals["weightedAccuracy"] += backtest["accuracy"] * backtest["testCount"]
        totals["weightedHitRate"] += backtest["hitRate"] * backtest["signalCount"]
        totals["pnl"] += backtest["cumulative"]
        totals["drawdown"] = max(totals["drawdown"], backtest["maxDrawdown"])

    return {
        "results": results,
        "testCount": totals["testCount"],
        "signalCount": totals["signalCount"],
        "accuracy": totals["weightedAccuracy"] / totals["testCount"] if totals["testCount"] else 0.0,
        "hitRate": totals["weightedHitRate"] / totals["signalCount"] if totals["signalCount"] else 0.0,
        "cumulative": totals["pnl"],
        "expectancy": totals["pnl"] / totals["signalCount"] if totals["signalCount"] else 0.0,
        "maxDrawdown": totals["drawdown"],
    }


def latest_signal_test(
    rows: list[PriceRow],
    ticker: str,
    horizon: int,
    confidence: float,
    settings: dict[str, dict[str, Any]],
    catalysts: dict[str, float],
    dte: int,
    iv: float,
    trade_cost: float,
    train_fraction: float,
) -> dict[str, Any]:
    """Score the most recent bar (live / forward view). No future return yet."""
    if len(rows) < 90 + horizon:
        raise ValueError("Need more history. Load or refresh ticker data.")
    cutoff = len(rows) - 1
    features = feature_at(rows, cutoff, catalysts)
    probability, raw = score_features(features, settings)
    daily = _returns([r.close for r in rows])
    recent_abs = _mean([abs(v) for v in daily[-40:]]) * math.sqrt(horizon) if daily else 0.0
    expected_abs_move = max(abs((probability - 0.5) * 2) * 0.06, recent_abs)
    predicted_return = (probability - 0.5) * 2 * expected_abs_move
    implied_move = iv * math.sqrt(dte / 365.0)
    movement_edge = expected_abs_move - implied_move
    if probability >= confidence:
        bias = "Bullish"
    elif probability <= 1 - confidence:
        bias = "Bearish"
    else:
        bias = "Neutral"
    history = rows[: cutoff + 1]
    pre_backtest = run_backtest(
        history, horizon, confidence, settings, catalysts, trade_cost, train_fraction
    )
    return {
        "ticker": ticker,
        "mode": "latest",
        "date": rows[cutoff].date,
        "close": rows[cutoff].close,
        "probabilityUp": probability,
        "rawScore": raw,
        "predictedReturn": predicted_return,
        "expectedMove": expected_abs_move,
        "realizedReturn": None,
        "futureDate": None,
        "impliedMove": implied_move,
        "movementEdge": movement_edge,
        "bias": bias,
        "directionCorrect": None,
        "backtest": pre_backtest,
        "coverage": coverage_label(history),
        "cutoffIndex": cutoff,
        "series": rows_to_dicts(history[-1500:]),
        "maxCutoff": len(rows) - horizon - 1,
        "rowCount": len(rows),
    }


def point_in_time_test(
    rows: list[PriceRow],
    ticker: str,
    cutoff_index: int,
    horizon: int,
    confidence: float,
    settings: dict[str, dict[str, Any]],
    catalysts: dict[str, float],
    dte: int,
    iv: float,
    trade_cost: float,
    train_fraction: float,
) -> dict[str, Any]:
    safe_cutoff = int(
        _clamp(cutoff_index, 90 + horizon, len(rows) - horizon - 1)
    )
    history = rows[: safe_cutoff + 1]
    features = feature_at(rows, safe_cutoff, catalysts)
    probability, raw = score_features(features, settings)
    realized_return = rows[safe_cutoff + horizon].close / rows[safe_cutoff].close - 1.0
    daily = _returns([r.close for r in history])
    recent_abs = _mean([abs(v) for v in daily[-40:]]) * math.sqrt(horizon) if daily else 0.0
    expected_abs_move = max(abs((probability - 0.5) * 2) * 0.06, recent_abs)
    predicted_return = (probability - 0.5) * 2 * expected_abs_move
    implied_move = iv * math.sqrt(dte / 365.0)
    movement_edge = expected_abs_move - implied_move
    if probability >= confidence:
        bias = "Bullish"
    elif probability <= 1 - confidence:
        bias = "Bearish"
    else:
        bias = "Neutral"
    direction_correct = (
        (bias == "Bullish" and realized_return > 0)
        or (bias == "Bearish" and realized_return < 0)
        or (bias == "Neutral" and abs(realized_return) < expected_abs_move)
    )
    pre_backtest = run_backtest(
        history, horizon, confidence, settings, catalysts, trade_cost, train_fraction
    )
    return {
        "ticker": ticker,
        "mode": "historical",
        "date": rows[safe_cutoff].date,
        "futureDate": rows[safe_cutoff + horizon].date,
        "close": rows[safe_cutoff].close,
        "futureClose": rows[safe_cutoff + horizon].close,
        "probabilityUp": probability,
        "rawScore": raw,
        "predictedReturn": predicted_return,
        "expectedMove": expected_abs_move,
        "realizedReturn": realized_return,
        "impliedMove": implied_move,
        "movementEdge": movement_edge,
        "bias": bias,
        "directionCorrect": direction_correct,
        "backtest": pre_backtest,
        "coverage": coverage_label(history),
        "cutoffIndex": safe_cutoff,
    }
