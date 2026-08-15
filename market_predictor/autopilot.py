from __future__ import annotations

from typing import Any

from .data import PriceRow


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _sma(rows: list[PriceRow], days: int) -> float | None:
    if len(rows) < days:
        return None
    return _mean([row.close for row in rows[-days:]])


def _atr_amount(rows: list[PriceRow], days: int = 14) -> float:
    ranges: list[float] = []
    for index in range(max(1, len(rows) - days), len(rows)):
        row = rows[index]
        previous_close = rows[index - 1].close
        ranges.append(max(row.high - row.low, abs(row.high - previous_close), abs(row.low - previous_close)))
    return _mean(ranges) or max(rows[-1].close * 0.015, 0.01)


def _price(value: float) -> float:
    return round(max(value, 0.01), 2)


def build_trade_plan(rows: list[PriceRow], signal: dict[str, Any], horizon: int) -> dict[str, Any]:
    """Build a transparent, volatility-aware plan from observed prices and model output."""
    latest = rows[-1]
    spot = latest.close
    atr = _atr_amount(rows)
    sma20 = _sma(rows, 20) or spot
    support = min(row.low for row in rows[-20:])
    resistance = max(row.high for row in rows[-20:])
    bias = str(signal.get("bias") or "Neutral")
    expected_move = abs(float(signal.get("expectedMove") or 0.0)) * spot
    backtest = signal.get("backtest") or {}
    hit_rate = float(backtest.get("hitRate") or 0.0)
    signal_count = int(backtest.get("signalCount") or 0)
    profit_factor = float(backtest.get("profitFactor") or 0.0)
    enough_evidence = signal_count >= 20
    validated = enough_evidence and hit_rate >= 0.52 and profit_factor >= 1.0

    if bias == "Bullish":
        entry_low = max(support, min(spot, sma20) - 0.35 * atr)
        entry_high = spot + 0.15 * atr
        invalidation = min(support - 0.25 * atr, entry_low - 1.25 * atr)
        target_one = max(resistance, spot + max(expected_move, atr))
        target_two = spot + max(expected_move * 1.75, atr * 2.0)
        entry_condition = "Enter only after price holds the entry zone or closes above the prior session high on healthy volume."
        action = "Consider long"
    elif bias == "Bearish":
        entry_low = spot - 0.15 * atr
        entry_high = min(resistance, max(spot, sma20) + 0.35 * atr)
        invalidation = max(resistance + 0.25 * atr, entry_high + 1.25 * atr)
        target_one = min(support, spot - max(expected_move, atr))
        target_two = spot - max(expected_move * 1.75, atr * 2.0)
        entry_condition = "Enter only after price rejects the entry zone or closes below the prior session low on healthy volume."
        action = "Consider bearish"
    else:
        entry_low = support
        entry_high = resistance
        invalidation = support - atr
        target_one = resistance
        target_two = resistance + atr
        entry_condition = "No directional entry yet. Wait for a confirmed break beyond the 20-session range."
        action = "No trade"

    risk = abs(((entry_low + entry_high) / 2.0) - invalidation)
    reward = abs(target_one - ((entry_low + entry_high) / 2.0))
    risk_reward = reward / risk if risk > 0 else None
    rejection_reasons: list[str] = []
    if bias == "Neutral":
        rejection_reasons.append("The model has no directional edge.")
    if not enough_evidence:
        rejection_reasons.append(f"Only {signal_count} qualifying historical signals are available; at least 20 are required.")
    elif hit_rate < 0.52:
        rejection_reasons.append(f"The historical hit rate is {hit_rate:.1%}, below the 52% evidence threshold.")
    if enough_evidence and profit_factor < 1.0:
        rejection_reasons.append(f"The historical profit factor is {profit_factor:.2f}, below the 1.00 break-even threshold.")
    if risk_reward is None or risk_reward < 1.5:
        rejection_reasons.append(
            "The measured reward-to-risk is unavailable."
            if risk_reward is None
            else f"The measured reward-to-risk is {risk_reward:.2f}x, below the 1.50x minimum."
        )
    if rejection_reasons:
        action = "No trade"
        entry_condition = "No entry is supported by the current evidence. Reassess only after the failed safeguards improve."

    return {
        "action": action,
        "bias": bias,
        "asOf": latest.date,
        "horizonDays": horizon,
        "entryZone": {"low": _price(entry_low), "high": _price(entry_high)},
        "entryCondition": entry_condition,
        "invalidation": _price(invalidation),
        "targets": [_price(target_one), _price(target_two)],
        "support20d": _price(support),
        "resistance20d": _price(resistance),
        "atr14": _price(atr),
        "estimatedRiskReward": round(risk_reward, 2) if risk_reward is not None else None,
        "rejectionReasons": rejection_reasons,
        "exitRules": [
            "Exit if the daily close crosses the invalidation level.",
            f"Reassess after {horizon} trading sessions even if neither target nor invalidation is reached.",
            "Consider taking partial profits at the first target and trailing the remainder by one ATR.",
        ],
        "evidence": {
            "backtestHitRate": hit_rate,
            "backtestSignals": signal_count,
            "profitFactor": profit_factor,
            "evidenceSufficient": enough_evidence,
            "historicallyValidated": validated,
            "minimumHitRate": 0.52,
            "minimumProfitFactor": 1.0,
            "minimumRiskReward": 1.5,
        },
        "riskNote": "Levels are a research framework, not guaranteed fills or personalized financial advice.",
    }


def build_rules_thesis(
    ticker: str,
    signal: dict[str, Any],
    research: dict[str, Any],
    horizon: int,
) -> dict[str, Any]:
    history = research.get("history") or {}
    volatility = research.get("volatility") or {}
    indicators = research.get("indicators") or {}
    events = research.get("events") or {}
    backtest = signal.get("backtest") or {}
    probability = float(signal.get("probabilityUp") or 0.5)
    bias = str(signal.get("bias") or "Neutral")
    trend = str(indicators.get("trend") or "mixed")
    hit_rate = float(backtest.get("hitRate") or 0.0)
    signal_count = int(backtest.get("signalCount") or 0)
    return_1y = history.get("return1y")
    drawdown = history.get("drawdownFrom52wHigh")
    rsi = indicators.get("rsi14")

    return_text = f"{float(return_1y):+.1%}" if return_1y is not None else "unavailable"
    drawdown_text = f"{float(drawdown):.1%}" if drawdown is not None else "unavailable"
    rsi_text = f"{float(rsi):.1f}" if rsi is not None else "unavailable"
    evidence = [
        f"{probability:.1%} modeled probability of an up move over {horizon} sessions",
        f"{hit_rate:.1%} historical signal hit rate across {signal_count} qualifying signals",
        f"One-year return {return_text}; drawdown from the 52-week high {drawdown_text}",
        f"Technical state: {trend}; RSI(14) {rsi_text}",
    ]
    headlines = [item.get("title") for item in events.get("items", [])[:3] if item.get("title")]
    conviction = "low"
    if signal_count >= 20 and hit_rate >= 0.55:
        conviction = "moderate"
    if signal_count >= 50 and hit_rate >= 0.60:
        conviction = "high"

    return {
        "ticker": ticker.upper(),
        "stance": bias,
        "conviction": conviction,
        "summary": (
            f"{ticker.upper()} is in a {trend} technical regime. The model is {bias.lower()} over the next "
            f"{horizon} trading sessions, with {probability:.1%} probability of an upward move."
        ),
        "bullCase": (
            f"Price strength can persist if momentum holds and the stock confirms above nearby resistance. "
            f"The measured one-year return is {return_text}."
        ),
        "baseCase": (
            f"The base case is a move within the recent volatility envelope; annualized realized volatility is "
            f"{float(volatility.get('realized1y') or 0.0):.1%}. Reassess after {horizon} sessions."
        ),
        "bearCase": (
            f"The thesis weakens if price loses support. The stock is currently {drawdown_text} from its "
            "52-week high, and model performance can decay outside its training regime."
        ),
        "evidence": evidence,
        "currentEventHeadlines": headlines,
        "methodology": "Rules-based synthesis of price history, technical indicators, backtest results, and sourced headlines. No generative AI is required.",
        "disclaimer": "Research only. Options can expire worthless and are not appropriate for every investor.",
    }
