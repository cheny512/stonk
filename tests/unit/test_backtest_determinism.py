from __future__ import annotations

import pytest
from market_predictor.backtest import run_backtest
from market_predictor.features import Example

def test_backtest_determinism():
    # Create synthetic examples
    examples = []
    for i in range(100):
        examples.append(Example(
            date=f"2024-01-{i+1:03d}",
            close=100.0 + i,
            x=[float(i), float(i % 5)],
            y_up=1 if i % 2 == 0 else 0,
            y_return=0.01 if i % 2 == 0 else -0.01
        ))
    
    res1 = run_backtest(examples)
    res2 = run_backtest(examples)
    
    assert res1.accuracy_all == res2.accuracy_all
    assert res1.cumulative_pnl == res2.cumulative_pnl
    assert res1.brier_score == res2.brier_score
    assert [t.date for t in res1.trades] == [t.date for t in res2.trades]

def test_backtest_small_dataset():
    examples = [Example("date", 1.0, [1.0], 1, 0.1)] * 50
    with pytest.raises(ValueError, match="Need at least 80 examples"):
        run_backtest(examples)
