from __future__ import annotations

import math
import random
from dataclasses import dataclass


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


def top_coefficients(names: list[str], weights: list[float], limit: int = 8) -> list[tuple[str, float]]:
    pairs = sorted(zip(names, weights), key=lambda item: abs(item[1]), reverse=True)
    return pairs[:limit]

