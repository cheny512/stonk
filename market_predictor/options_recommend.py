from __future__ import annotations

import math
from dataclasses import asdict
from typing import Any

from .data_providers.types import OptionQuote, OptionsChain
from .options import score_options_setup


def _median_iv(quotes: list[OptionQuote]) -> float | None:
    values = [q.implied_vol for q in quotes if q.implied_vol and q.implied_vol > 0]
    if not values:
        return None
    values.sort()
    return values[len(values) // 2]


def _dte_days(expiration: str, as_of: str) -> int:
    try:
        from datetime import date

        exp = date.fromisoformat(expiration[:10])
        base = date.fromisoformat(as_of[:10])
        return max(1, (exp - base).days)
    except ValueError:
        return 30


def recommend_option_contracts(
    chain: OptionsChain,
    probability_up: float,
    predicted_return: float,
    expected_move_pct: float,
    horizon_days: int,
    confidence: float = 0.56,
    max_results: int = 8,
) -> dict[str, Any]:
    spot = chain.spot or 0.0
    quotes = chain.quotes
    if not quotes:
        return {
            "available": False,
            "message": "No options chain data for this date.",
            "contracts": [],
        }

    median_iv = _median_iv(quotes)
    target_dte = max(horizon_days * 3, 14)
    expirations = sorted({q.expiration for q in quotes if q.expiration})
    if not expirations:
        return {"available": False, "message": "No expirations in chain.", "contracts": []}

    def exp_distance(exp: str) -> int:
        return abs(_dte_days(exp, chain.as_of) - target_dte)

    best_exp = min(expirations, key=exp_distance)
    bucket = [q for q in quotes if q.expiration == best_exp]
    if spot <= 0:
        spot = bucket[0].strike if bucket else 0.0

    if probability_up >= confidence:
        side = "call"
        right_filter = {"call", "c"}
    elif probability_up <= 1.0 - confidence:
        side = "put"
        right_filter = {"put", "p"}
    else:
        side = "neutral"
        right_filter = {"call", "c", "put", "p"}

    candidates = [q for q in bucket if q.right.lower() in right_filter]
    if not candidates:
        candidates = bucket

    def moneyness(q: OptionQuote) -> float:
        if spot <= 0:
            return 0.0
        return q.strike / spot - 1.0

    if side == "call":
        candidates.sort(key=lambda q: (abs(moneyness(q) - 0.03), -(q.volume or 0), -(q.open_interest or 0)))
    elif side == "put":
        candidates.sort(key=lambda q: (abs(moneyness(q) + 0.03), -(q.volume or 0), -(q.open_interest or 0)))
    else:
        candidates.sort(key=lambda q: (-(q.volume or 0), abs(moneyness(q))))

    iv = median_iv or 0.35
    dte = _dte_days(best_exp, chain.as_of)
    setup = score_options_setup(
        probability_up=probability_up,
        predicted_return=predicted_return,
        realized_abs_move_pct=expected_move_pct,
        days_to_expiry=dte,
        implied_vol=iv,
        confidence=confidence,
    )

    contracts: list[dict[str, Any]] = []
    for q in candidates[:max_results]:
        mid = q.mid if q.mid > 0 else (q.bid + q.ask) / 2
        spread_pct = (q.ask - q.bid) / mid if mid > 0 and q.ask > q.bid else 0.0
        contracts.append(
            {
                "symbol": q.symbol,
                "type": q.right,
                "strike": q.strike,
                "expiration": q.expiration,
                "dte": _dte_days(q.expiration, chain.as_of),
                "bid": q.bid,
                "ask": q.ask,
                "mid": mid,
                "spreadPct": spread_pct,
                "impliedVol": q.implied_vol,
                "delta": q.delta,
                "openInterest": q.open_interest,
                "volume": q.volume,
                "moneynessPct": moneyness(q),
                "liquidityScore": (q.volume or 0) + (q.open_interest or 0) * 0.1,
            }
        )

    return {
        "available": True,
        "provider": chain.provider,
        "asOf": chain.as_of,
        "spot": spot,
        "targetExpiration": best_exp,
        "targetDte": dte,
        "medianIv": iv,
        "side": side,
        "setup": asdict(setup),
        "contracts": contracts,
    }


def attach_options_to_signal(
    signal: dict[str, Any],
    chain: OptionsChain | None,
    horizon: int,
    confidence: float,
) -> dict[str, Any]:
    if chain is None:
        signal["options"] = {"available": False, "message": "Options chain not loaded."}
        return signal
    rec = recommend_option_contracts(
        chain,
        probability_up=float(signal.get("probabilityUp", 0.5)),
        predicted_return=float(signal.get("predictedReturn", 0.0)),
        expected_move_pct=float(signal.get("expectedMove", 0.0)),
        horizon_days=horizon,
        confidence=confidence,
    )
    signal["options"] = rec
    if rec.get("medianIv"):
        signal["impliedMove"] = rec["setup"]["implied_move_pct"]
        signal["movementEdge"] = rec["setup"]["movement_edge_pct"]
    return signal
