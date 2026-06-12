from __future__ import annotations

import random
import pytest
from market_predictor.models import train_logistic, train_linear, StandardScaler

def test_standard_scaler():
    x = [[10.0, 1.0], [20.0, 2.0], [30.0, 3.0]]
    scaler = StandardScaler.fit(x)
    transformed = scaler.transform(x)
    # Means should be roughly zero
    assert abs(sum(row[0] for row in transformed)) < 1e-10
    
    one = scaler.transform_one([20.0, 2.0])
    assert one[0] == 0.0

def test_logistic_convergence():
    random.seed(42)
    # Synthetic separable data
    x = []
    y = []
    for _ in range(100):
        val = random.random()
        x.append([val])
        y.append(1 if val > 0.5 else 0)
    
    model = train_logistic(x, y, epochs=1000, lr=0.1)
    # Test on a point
    prob = model.predict_proba([0.8])
    assert prob > 0.5
    prob_low = model.predict_proba([0.2])
    assert prob_low < 0.5

def test_linear_convergence():
    random.seed(42)
    # y = 2x + 1
    x = []
    y = []
    for _ in range(100):
        val = random.random()
        x.append([val])
        y.append(2.0 * val + 1.0)
    
    model = train_linear(x, y, epochs=1000, lr=0.1)
    # For a point x=0.5, y should be 2.0*0.5 + 1.0 = 2.0
    pred = model.predict([0.5])
    assert abs(pred - 2.0) < 0.1
