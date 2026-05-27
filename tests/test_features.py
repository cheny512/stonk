from market_predictor.features import pct_change, rsi


def test_pct_change():
    assert abs(pct_change(110, 100) - 0.1) < 1e-12


def test_rsi_bounds():
    closes = [float(100 + i) for i in range(30)]
    value = rsi(closes, 14)
    assert 0.0 <= value <= 1.0
