from __future__ import annotations

import pytest
import math
from market_predictor.data import PriceRow
from market_predictor.features import (
    rsi,
    returns,
    pct_change,
    mean,
    stdev,
    beta,
    feature_at
)

def test_pct_change():
    assert round(pct_change(110.0, 100.0), 4) == 0.1
    assert round(pct_change(90.0, 100.0), 4) == -0.1
    assert pct_change(100.0, 0.0) == 0.0

def test_mean():
    assert mean([1.0, 2.0, 3.0]) == 2.0
    assert mean([]) == 0.0

def test_stdev():
    assert stdev([1.0, 2.0, 3.0]) == 1.0
    assert stdev([10.0]) == 0.0

def test_returns():
    closes = [100.0, 110.0, 99.0]
    rets = returns(closes)
    assert round(rets[0], 4) == 0.1
    assert round(rets[1], 4) == -0.1

def test_rsi_flat():
    closes = [100.0] * 20
    # Current implementation returns 1.0 if avg_loss is 0
    assert rsi(closes) == 1.0

def test_rsi_uptrend():
    closes = [100.0 + i for i in range(20)]
    assert rsi(closes) == 1.0

def test_beta():
    stock = [0.01, 0.02, 0.01, 0.02, 0.01]
    market = [0.01, 0.02, 0.01, 0.02, 0.01]
    assert round(beta(stock, market), 2) == 1.0

def test_feature_at(tmp_dataset):
    # tmp_dataset provides 30 rows
    idx = 25
    features = feature_at(tmp_dataset, idx)
    assert len(features) >= 18
    # ret_1 (idx 0)
    assert round(features[0], 4) == round(pct_change(tmp_dataset[25].close, tmp_dataset[24].close), 4)
