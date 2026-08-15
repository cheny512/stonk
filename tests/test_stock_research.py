from market_predictor.data import PriceRow
from market_predictor.stock_research import build_history_summary


def _rows(count=300):
    rows = []
    close = 100.0
    for day in range(count):
        close += 0.2 if day % 3 else -0.1
        rows.append(
            PriceRow(
                date=f"2026-01-{(day % 28) + 1:02d}",
                open=close - 0.5,
                high=close + 1.0,
                low=close - 1.0,
                close=close,
                volume=1_000_000 + day * 1000,
                extras={},
            )
        )
    return rows


def test_history_summary_includes_research_metrics():
    summary = build_history_summary(_rows())

    assert summary["history"]["rows"] == 300
    assert summary["history"]["return5d"] is not None
    assert summary["volatility"]["realized20d"] is not None
    assert summary["volume"]["relativeVolume20d"] is not None
    assert 0 <= summary["volume"]["buyPressure20d"] <= 1
    assert summary["indicators"]["sma50"] is not None
    assert summary["indicators"]["rsi14"] is not None
    assert summary["analysis"]["trend"] in {"uptrend", "downtrend", "mixed"}
    assert summary["analysis"]["observations"]
