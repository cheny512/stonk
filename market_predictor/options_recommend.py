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
    max_spread_pct: float = 0.25,
    min_open_interest: float = 50,
    min_volume: float = 1,
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
        # Target strike near current price + predicted return
        target_strike = spot * (1.0 + predicted_return) if spot > 0 else 0
    elif probability_up <= 1.0 - confidence:
        side = "put"
        right_filter = {"put", "p"}
        target_strike = spot * (1.0 + predicted_return) if spot > 0 else 0
    else:
        side = "neutral"
        right_filter = {"call", "c", "put", "p"}
        target_strike = spot

    candidates = [q for q in bucket if q.right.lower() in right_filter]
    if not candidates:
        candidates = bucket

    def quote_spread_pct(q: OptionQuote) -> float:
        mid = q.mid if q.mid > 0 else (q.bid + q.ask) / 2
        return (q.ask - q.bid) / mid if mid > 0 and q.ask >= q.bid else math.inf

    liquid_candidates = [
        quote
        for quote in candidates
        if quote.bid > 0
        and quote.ask >= quote.bid
        and quote_spread_pct(quote) <= max_spread_pct
        and (quote.open_interest or 0) >= min_open_interest
        and (quote.volume or 0) >= min_volume
    ]
    rejected_count = len(candidates) - len(liquid_candidates)
    if not liquid_candidates:
        return {
            "available": False,
            "provider": chain.provider,
            "asOf": chain.as_of,
            "message": "No contracts passed the spread, open-interest, and volume safeguards.",
            "contracts": [],
            "filters": {
                "maxSpreadPct": max_spread_pct,
                "minOpenInterest": min_open_interest,
                "minVolume": min_volume,
            },
            "rejectedCount": rejected_count,
        }
    candidates = liquid_candidates

    def moneyness(q: OptionQuote) -> float:
        if spot <= 0:
            return 0.0
        return q.strike / spot - 1.0

    def strike_score(q: OptionQuote) -> float:
        """Lower is better. Prioritize strikes near target while keeping liquidity."""
        dist = abs(q.strike - target_strike) / spot if spot > 0 else 0
        liquidity = (q.volume or 0) + (q.open_interest or 0) * 0.1
        return dist * 10.0 - math.log10(max(1, liquidity))

    candidates.sort(key=strike_score)

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
                "estimatedDebit": mid * 100,
                "maxLoss": mid * 100,
                "breakEven": q.strike + mid if q.right.lower() in {"call", "c"} else q.strike - mid,
                "eligible": True,
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
        "filters": {
            "maxSpreadPct": max_spread_pct,
            "minOpenInterest": min_open_interest,
            "minVolume": min_volume,
        },
        "rejectedCount": rejected_count,
        "methodology": "Educational liquidity screen ranked by target-strike distance and observed volume/open interest.",
        "riskDisclosure": "This is not a personalized recommendation. Long options can lose 100% of premium; quotes can change before execution.",
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
