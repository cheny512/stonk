from __future__ import annotations

from typing import Any

from .live_data import fetch_ticker_history, get_live_quote, load_ticker_rows
from .options_recommend import attach_options_to_signal
from .ui_model import DEFAULT_CATALYSTS, feature_at, latest_signal_test, score_features


def generate_live_signals(
    tickers: list[str],
    settings: dict[str, dict[str, Any]],
    horizon: int,
    confidence: float,
    catalysts: dict[str, float] | None = None,
    dte: int = 21,
    iv_fallback: float = 0.45,
    trade_cost: float = 0.001,
    train_fraction: float = 0.7,
    refresh: bool = True,
    include_options: bool = True,
) -> dict[str, Any]:
    """Score a watchlist with trained weights on the latest bar (live deployment)."""
    catalysts = catalysts or dict(DEFAULT_CATALYSTS)
    signals: list[dict[str, Any]] = []
    errors: dict[str, str] = {}

    for ticker in tickers:
        symbol = ticker.upper()
        try:
            if refresh:
                try:
                    fetch_ticker_history(symbol, years=2, provider="auto")
                except Exception:
                    pass
            rows = load_ticker_rows(symbol)
            result = latest_signal_test(
                rows,
                symbol,
                horizon,
                confidence,
                settings,
                catalysts,
                dte,
                iv_fallback,
                trade_cost,
                train_fraction,
            )
            try:
                result["quote"] = get_live_quote(symbol)
            except Exception:
                result["quote"] = None

            if include_options:
                try:
                    from .data import load_options_chain

                    as_of = rows[-1].date
                    chain = load_options_chain(symbol, as_of, mode="live")
                    attach_options_to_signal(result, chain, horizon, confidence)
                except Exception as exc:
                    result["options"] = {"available": False, "message": str(exc)}

            signals.append(result)
        except Exception as exc:
            errors[symbol] = str(exc)

    bullish = sum(1 for s in signals if s.get("bias") == "Bullish")
    bearish = sum(1 for s in signals if s.get("bias") == "Bearish")
    return {
        "signals": signals,
        "errors": errors,
        "count": len(signals),
        "bullish": bullish,
        "bearish": bearish,
        "neutral": len(signals) - bullish - bearish,
    }
