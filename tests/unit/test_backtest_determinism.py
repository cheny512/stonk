from __future__ import annotations

import pytest
from market_predictor.backtest import run_backtest, run_walk_forward_backtest
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


def _walk_forward_examples(count: int = 520) -> list[Example]:
    examples = []
    close = 100.0
    for index in range(count):
        direction = 1 if index % 7 not in (0, 1) else -1
        realized = direction * 0.012
        close *= 1.0 + realized / 5.0
        examples.append(
            Example(
                date=f"{index:04d}",
                close=close,
                x=[float(direction), float(index % 20) / 20.0],
                y_up=int(realized > 0),
                y_return=realized,
            )
        )
    return examples


def test_walk_forward_is_purged_non_overlapping_and_reproducible():
    examples = _walk_forward_examples()
    first = run_walk_forward_backtest(examples, min_train_size=252, test_size=63, holding_period=5)
    second = run_walk_forward_backtest(examples, min_train_size=252, test_size=63, holding_period=5)

    assert first == second
    assert first.validation_scheme == "expanding-window-purged"
    assert first.benchmark_name == "underlying-buy-and-hold"
    assert first.purge_gap == 5
    assert len(first.folds) >= 3
    assert first.folds[0].train_end == examples[251].date
    assert first.folds[0].test_start == examples[257].date
    assert first.signal_count <= sum((fold.test_examples + 4) // 5 for fold in first.folds)
    assert 0 <= first.hit_rate_ci_95[0] <= first.signal_hit_rate <= first.hit_rate_ci_95[1] <= 1
    assert first.max_drawdown >= 0


def test_walk_forward_rejects_leaky_purge_gap():
    with pytest.raises(ValueError, match="purge_gap"):
        run_walk_forward_backtest(
            _walk_forward_examples(),
            min_train_size=252,
            holding_period=5,
            purge_gap=4,
        )
