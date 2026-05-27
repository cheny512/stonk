import math

from market_predictor.options import score_options_setup


def test_implied_move_from_iv_and_dte():
    result = score_options_setup(
        probability_up=0.62,
        predicted_return=0.04,
        realized_abs_move_pct=0.03,
        days_to_expiry=30,
        implied_vol=0.40,
    )
    expected_iv_move = 0.40 * math.sqrt(30 / 365.0)
    assert abs(result.implied_move_pct - expected_iv_move) < 1e-9


def test_bullish_bias_above_confidence():
    result = score_options_setup(
        probability_up=0.70,
        predicted_return=0.05,
        realized_abs_move_pct=0.02,
        days_to_expiry=14,
        implied_vol=0.25,
        confidence=0.56,
    )
    assert result.bias == "bullish"


def test_neutral_when_probability_near_half():
    result = score_options_setup(
        probability_up=0.52,
        predicted_return=0.01,
        realized_abs_move_pct=0.01,
        days_to_expiry=14,
        implied_vol=0.30,
        confidence=0.56,
    )
    assert result.bias == "neutral/unclear"
