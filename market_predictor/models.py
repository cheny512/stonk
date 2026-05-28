from __future__ import annotations

import math
import random
from dataclasses import dataclass
from typing import Any, Literal

import numpy as np


def sigmoid(value: float) -> float:
    if value >= 35:
        return 1.0
    if value <= -35:
        return 0.0
    return 1.0 / (1.0 + math.exp(-value))


@dataclass
class StandardScaler:
    means: list[float]
    scales: list[float]

    @classmethod
    def fit(cls, x_rows: list[list[float]]) -> "StandardScaler":
        if not x_rows:
            raise ValueError("No rows to scale")
        width = len(x_rows[0])
        means: list[float] = []
        scales: list[float] = []
        for col in range(width):
            values = [row[col] for row in x_rows]
            avg = sum(values) / len(values)
            var = sum((v - avg) ** 2 for v in values) / max(1, len(values) - 1)
            scale = math.sqrt(var)
            means.append(avg)
            scales.append(scale if scale > 1e-12 else 1.0)
        return cls(means, scales)

    def transform_one(self, row: list[float]) -> list[float]:
        return [(row[i] - self.means[i]) / self.scales[i] for i in range(len(row))]

    def transform(self, rows: list[list[float]]) -> list[list[float]]:
        return [self.transform_one(row) for row in rows]


@dataclass
class LogisticModel:
    weights: list[float]
    bias: float

    def predict_proba(self, row: list[float]) -> float:
        score = self.bias + sum(w * x for w, x in zip(self.weights, row))
        return sigmoid(score)


@dataclass
class LinearModel:
    weights: list[float]
    bias: float

    def predict(self, row: list[float]) -> float:
        return self.bias + sum(w * x for w, x in zip(self.weights, row))


def train_logistic(
    x_rows: list[list[float]],
    y: list[int],
    epochs: int = 450,
    lr: float = 0.035,
    l2: float = 0.002,
    seed: int = 7,
) -> LogisticModel:
    width = len(x_rows[0])
    weights = [0.0] * width
    bias = 0.0
    order = list(range(len(x_rows)))
    rng = random.Random(seed)
    for epoch in range(epochs):
        rng.shuffle(order)
        step = lr / (1.0 + epoch / 180.0)
        for i in order:
            pred = sigmoid(bias + sum(weights[j] * x_rows[i][j] for j in range(width)))
            error = pred - y[i]
            bias -= step * error
            for j in range(width):
                weights[j] -= step * (error * x_rows[i][j] + l2 * weights[j])
    return LogisticModel(weights, bias)


def train_linear(
    x_rows: list[list[float]],
    y: list[float],
    epochs: int = 550,
    lr: float = 0.025,
    l2: float = 0.004,
    seed: int = 11,
) -> LinearModel:
    width = len(x_rows[0])
    weights = [0.0] * width
    bias = 0.0
    order = list(range(len(x_rows)))
    rng = random.Random(seed)
    for epoch in range(epochs):
        rng.shuffle(order)
        step = lr / (1.0 + epoch / 220.0)
        for i in order:
            pred = bias + sum(weights[j] * x_rows[i][j] for j in range(width))
            error = pred - y[i]
            bias -= step * error
            for j in range(width):
                weights[j] -= step * (error * x_rows[i][j] + l2 * weights[j])
    return LinearModel(weights, bias)


class AdvancedModelWrapper:
    """Wrapper for external models (XGBoost, SVM, etc.) to match stonk API."""

    def __init__(self, model: Any, kind: str) -> None:
        self.model = model
        self.kind = kind

    def predict_proba(self, row: list[float]) -> float:
        x = np.array([row])
        if self.kind in ("xgboost", "lightgbm", "svm"):
            return float(self.model.predict_proba(x)[0][1])
        return 0.5


class ModelFactory:
    """Pluggable engine factory for different trading horizons."""

    @staticmethod
    def train_xgboost(x_train: list[list[float]], y_train: list[int]) -> AdvancedModelWrapper:
        import xgboost as xgb

        model = xgb.XGBClassifier(
            n_estimators=100,
            max_depth=5,
            learning_rate=0.08,
            objective="binary:logistic",
            random_state=42,
        )
        model.fit(np.array(x_train), np.array(y_train))
        return AdvancedModelWrapper(model, "xgboost")

    @staticmethod
    def train_svm(x_train: list[list[float]], y_train: list[int]) -> AdvancedModelWrapper:
        from sklearn.svm import SVC

        model = SVC(probability=True, kernel="rbf", C=1.0)
        model.fit(np.array(x_train), np.array(y_train))
        return AdvancedModelWrapper(model, "svm")

    @staticmethod
    def train_lstm(x_sequences: list[np.ndarray], y_train: list[int]) -> Any:
        """Sequential LSTM via PyTorch."""
        import torch
        import torch.nn as nn

        class LSTMModel(nn.Module):
            def __init__(self, input_size, hidden_size=64, num_layers=2):
                super().__init__()
                self.lstm = nn.LSTM(input_size, hidden_size, num_layers, batch_first=True)
                self.fc = nn.Linear(hidden_size, 1)
                self.sigmoid = nn.Sigmoid()

            def forward(self, x):
                _, (hn, _) = self.lstm(x)
                return self.sigmoid(self.fc(hn[-1]))

        # This is a placeholder for a full PyTorch training loop
        return None


def top_coefficients(names: list[str], weights: list[float], limit: int = 8) -> list[tuple[str, float]]:
    pairs = sorted(zip(names, weights), key=lambda item: abs(item[1]), reverse=True)
    return pairs[:limit]

