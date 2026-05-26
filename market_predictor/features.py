from __future__ import annotations

import math
from dataclasses import dataclass

from .data import PriceRow


EVENT_FIELDS = [
    "earnings_surprise",
    "revenue_surprise",
    "guidance_score",
    "contract_score",
    "sentiment_score",
    "ceo_confidence",
    "rate_shock",
    "sector_momentum",
]


BASE_FEATURES = [
    "ret_1",
    "ret_5",
    "ret_10",
    "ret_20",
    "vol_10",
    "vol_20",
    "abs_move_10",
    "abs_move_20",
    "volume_z_20",
    "sma_20_gap",
    "sma_50_gap",
    "rsi_14",
    "range_pct",
    "close_pos_20",
    "trend_consistency_10",
    "market_ret_5",
    "market_ret_20",
    "beta_20",
] + EVENT_FIELDS


@dataclass(frozen=True)
class Example:
    date: str
    close: float
    x: list[float]
    y_up: int
    y_return: float


def pct_change(now: float, then: float) -> float:
    if then == 0:
        return 0.0
    return now / then - 1.0


def mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def stdev(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    avg = mean(values)
    var = sum((v - avg) ** 2 for v in values) / (len(values) - 1)
    return math.sqrt(max(var, 0.0))


def returns(closes: list[float]) -> list[float]:
    out: list[float] = []
    for i in range(1, len(closes)):
        out.append(pct_change(closes[i], closes[i - 1]))
    return out


def rsi(closes: list[float], window: int = 14) -> float:
    if len(closes) <= window:
        return 0.5
    gains: list[float] = []
    losses: list[float] = []
    for i in range(len(closes) - window, len(closes)):
        change = closes[i] - closes[i - 1]
        gains.append(max(change, 0.0))
        losses.append(abs(min(change, 0.0)))
    avg_gain = mean(gains)
    avg_loss = mean(losses)
    if avg_loss == 0:
        return 1.0
    rs = avg_gain / avg_loss
    return 1.0 - (1.0 / (1.0 + rs))


def beta(stock_returns: list[float], market_returns: list[float]) -> float:
    n = min(len(stock_returns), len(market_returns))
    if n < 5:
        return 0.0
    sr = stock_returns[-n:]
    mr = market_returns[-n:]
    avg_s = mean(sr)
    avg_m = mean(mr)
    var_m = sum((m - avg_m) ** 2 for m in mr)
    if var_m == 0:
        return 0.0
    cov = sum((sr[i] - avg_s) * (mr[i] - avg_m) for i in range(n))
    return cov / var_m


def _benchmark_lookup(benchmark_rows: list[PriceRow] | None) -> dict[str, int]:
    if not benchmark_rows:
        return {}
    return {row.date: i for i, row in enumerate(benchmark_rows)}


def feature_at(
    rows: list[PriceRow],
    idx: int,
    benchmark_rows: list[PriceRow] | None = None,
) -> list[float]:
    row = rows[idx]
    closes = [r.close for r in rows[: idx + 1]]
    volumes = [r.volume for r in rows[: idx + 1]]
    daily = returns(closes)

    def ret(period: int) -> float:
        if len(closes) <= period:
            return 0.0
        return pct_change(closes[-1], closes[-1 - period])

    vol_10 = stdev(daily[-10:]) * math.sqrt(252)
    vol_20 = stdev(daily[-20:]) * math.sqrt(252)
    abs_move_10 = mean([abs(v) for v in daily[-10:]])
    abs_move_20 = mean([abs(v) for v in daily[-20:]])
    vol_window = volumes[-20:]
    volume_z = 0.0
    if len(vol_window) >= 5:
        sd = stdev(vol_window)
        volume_z = 0.0 if sd == 0 else (volumes[-1] - mean(vol_window)) / sd

    sma_20 = mean(closes[-20:])
    sma_50 = mean(closes[-50:])
    highs_20 = [r.high for r in rows[max(0, idx - 19) : idx + 1]]
    lows_20 = [r.low for r in rows[max(0, idx - 19) : idx + 1]]
    high_20 = max(highs_20)
    low_20 = min(lows_20)
    close_pos_20 = 0.5 if high_20 == low_20 else (row.close - low_20) / (high_20 - low_20)
    trend_consistency = sum(1 for value in daily[-10:] if value > 0) / max(1, min(10, len(daily)))

    market_ret_5 = 0.0
    market_ret_20 = 0.0
    beta_20 = 0.0
    if benchmark_rows:
        lookup = _benchmark_lookup(benchmark_rows)
        bidx = lookup.get(row.date)
        if bidx is not None and bidx >= 20:
            b_closes = [r.close for r in benchmark_rows[: bidx + 1]]
            b_daily = returns(b_closes)
            market_ret_5 = pct_change(b_closes[-1], b_closes[-6]) if len(b_closes) > 5 else 0.0
            market_ret_20 = pct_change(b_closes[-1], b_closes[-21]) if len(b_closes) > 20 else 0.0
            beta_20 = beta(daily[-20:], b_daily[-20:])

    values = [
        ret(1),
        ret(5),
        ret(10),
        ret(20),
        vol_10,
        vol_20,
        abs_move_10,
        abs_move_20,
        volume_z,
        pct_change(row.close, sma_20),
        pct_change(row.close, sma_50),
        rsi(closes, 14),
        (row.high - row.low) / row.close if row.close else 0.0,
        close_pos_20,
        trend_consistency,
        market_ret_5,
        market_ret_20,
        beta_20,
    ]
    values.extend(row.extras.get(name, 0.0) for name in EVENT_FIELDS)
    return values


def build_examples(
    rows: list[PriceRow],
    horizon: int = 5,
    benchmark_rows: list[PriceRow] | None = None,
    min_history: int = 60,
    direction_threshold: float = 0.0,
) -> list[Example]:
    if len(rows) <= min_history + horizon + 5:
        raise ValueError("Not enough rows for requested horizon")
    examples: list[Example] = []
    for idx in range(min_history, len(rows) - horizon):
        future_return = pct_change(rows[idx + horizon].close, rows[idx].close)
        examples.append(
            Example(
                date=rows[idx].date,
                close=rows[idx].close,
                x=feature_at(rows, idx, benchmark_rows),
                y_up=1 if future_return > direction_threshold else 0,
                y_return=future_return,
            )
        )
    return examples

