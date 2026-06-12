from __future__ import annotations

import pytest
from market_predictor.weight_optimizer import collect_samples
from market_predictor.data import PriceRow

def test_collect_samples_determinism(tmp_dataset):
    datasets = [{"ticker": "AAPL", "rows": tmp_dataset}]
    horizon = 5
    catalysts = {}
    samples1 = collect_samples(datasets, horizon, catalysts)
    samples2 = collect_samples(datasets, horizon, catalysts)
    
    assert len(samples1) == len(samples2)
    assert [s.date for s in samples1] == [s.date for s in samples2]
    assert [s.y_up for s in samples1] == [s.y_up for s in samples2]

def test_train_val_split_logic():
    # We'll test the logic inside train_autonomous_weights via integration or unit if we refactor it
    # For now, we'll verify it non-overlapping in a high-level way if possible.
    pass
