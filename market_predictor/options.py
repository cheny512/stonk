from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class OptionsScore:
    bias: str
    setup: str
    implied_move_pct: float
    expected_move_pct: float
    movement_edge_pct: float
    confidence_note: str
    risk_note: str


def score_options_setup(
    probability_up: float,
    predicted_return: float,
    realized_abs_move_pct: float,
    days_to_expiry: int | None,
    implied_vol: float | None,
    confidence: float = 0.56,
) -> OptionsScore:
    expected_move_pct = max(abs(predicted_return), realized_abs_move_pct)
    implied_move_pct = 0.0
    if implied_vol is not None and days_to_expiry is not None and days_to_expiry > 0:
        implied_move_pct = implied_vol * math.sqrt(days_to_expiry / 365.0)

    movement_edge_pct = expected_move_pct - implied_move_pct if implied_move_pct else 0.0

    if probability_up >= confidence:
        bias = "bullish"
    elif probability_up <= 1.0 - confidence:
        bias = "bearish"
    else:
        bias = "neutral/unclear"

    if implied_move_pct == 0.0:
        setup = "Need implied volatility and DTE to compare option pricing."
    elif movement_edge_pct > 0 and bias == "bullish":
        setup = "Long call spread or other defined-risk bullish structure."
    elif movement_edge_pct > 0 and bias == "bearish":
        setup = "Long put spread or other defined-risk bearish structure."
    elif movement_edge_pct > 0:
        setup = "Directional edge unclear; volatility may be underpriced."
    else:
        setup = "Long premium looks expensive unless you have a stronger catalyst."

    confidence_note = (
        "High enough for a model signal."
        if bias != "neutral/unclear"
        else "Below signal threshold; avoid forcing a directional options trade."
    )
    risk_note = (
        "Use defined risk. Options can lose 100% of premium and spreads can gap through stops around news."
    )
    return OptionsScore(
        bias=bias,
        setup=setup,
        implied_move_pct=implied_move_pct,
        expected_move_pct=expected_move_pct,
        movement_edge_pct=movement_edge_pct,
        confidence_note=confidence_note,
        risk_note=risk_note,
    )

