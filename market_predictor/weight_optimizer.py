from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .data import PriceRow
from .models import StandardScaler, train_logistic, train_linear
from .ui_model import (
    INDICATOR_CATALOG,
    correlation,
    feature_at,
    rank_indicators,
    score_features,
)


@dataclass(frozen=True)
class TrainingSample:
    date: str
    ticker: str
    x: list[float]
    y_up: int
    y_return: float


def _feature_vector(features: dict[str, float]) -> list[float]:
    return [float(features.get(str(item["key"]), 0.0)) for item in INDICATOR_CATALOG]


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def collect_samples(
    datasets: list[dict[str, Any]],
    horizon: int,
    catalysts: dict[str, float],
) -> list[TrainingSample]:
    samples: list[TrainingSample] = []
    for dataset in datasets:
        rows: list[PriceRow] = dataset["rows"]
        ticker = str(dataset["ticker"]).upper()
        for i in range(70, len(rows) - horizon):
            features = feature_at(rows, i, catalysts)
            future_return = rows[i + horizon].close / rows[i].close - 1.0
            samples.append(
                TrainingSample(
                    date=rows[i].date,
                    ticker=ticker,
                    x=_feature_vector(features),
                    y_up=1 if future_return > 0 else 0,
                    y_return=future_return,
                )
            )
    samples.sort(key=lambda row: (row.date, row.ticker))
    return samples


def _settings_from_logistic_weights(weights: list[float], threshold: float = 0.04) -> dict[str, dict[str, Any]]:
    settings: dict[str, dict[str, Any]] = {}
    for i, item in enumerate(INDICATOR_CATALOG):
        key = str(item["key"])
        weight = _clamp(weights[i], -3.0, 3.0)
        settings[key] = {
            "enabled": abs(weight) >= threshold,
            "weight": weight,
        }
    return settings


def _evaluate_settings(
    samples: list[TrainingSample],
    settings: dict[str, dict[str, Any]],
    catalysts: dict[str, float],
    confidence: float,
    datasets_by_ticker: dict[str, list[PriceRow]],
    horizon: int,
) -> dict[str, float]:
    """Evaluate indicator-weight settings on held-out samples."""
    del catalysts, datasets_by_ticker, horizon  # features already baked into samples via x re-score path

    correct = 0
    brier = 0.0
    signal_hits = 0
    signal_count = 0
    for sample in samples:
        features = {
            str(INDICATOR_CATALOG[i]["key"]): sample.x[i] for i in range(len(INDICATOR_CATALOG))
        }
        probability, _ = score_features(features, settings)
        correct += 1 if (probability >= 0.5) == sample.y_up else 0
        brier += (probability - sample.y_up) ** 2
        is_long = probability >= confidence
        is_short = probability <= 1.0 - confidence
        if is_long or is_short:
            signal_count += 1
            hit = (is_long and sample.y_up == 1) or (is_short and sample.y_up == 0)
            signal_hits += 1 if hit else 0

    n = len(samples) or 1
    return {
        "accuracy": correct / n,
        "brier": brier / n,
        "hitRate": signal_hits / signal_count if signal_count else 0.0,
        "signalCount": float(signal_count),
    }


def train_autonomous_weights(
    datasets: list[dict[str, Any]],
    horizon: int,
    catalysts: dict[str, float],
    train_fraction: float = 0.7,
    confidence: float = 0.56,
    l2: float = 0.003,
    epochs: int = 600,
) -> dict[str, Any]:
    """
    Jointly learn all indicator weights via chronological logistic + return regression.
    Weights are model coefficients — not hand-tuned correlation scalings.
    """
    samples = collect_samples(datasets, horizon, catalysts)
    if len(samples) < 120:
        raise ValueError(f"Need at least 120 training samples, got {len(samples)}")

    split = int(len(samples) * train_fraction)
    if split < 80 or len(samples) - split < 30:
        raise ValueError("Not enough samples for train/validation split")

    train = samples[:split]
    validation = samples[split:]

    scaler = StandardScaler.fit([row.x for row in train])
    x_train = scaler.transform([row.x for row in train])
    y_up = [row.y_up for row in train]
    y_return = [row.y_return for row in train]

    direction_model = train_logistic(x_train, y_up, epochs=epochs, l2=l2)
    return_model = train_linear(x_train, y_return, epochs=epochs, l2=l2 * 2)

    settings = _settings_from_logistic_weights(direction_model.weights)

    val_metrics = _evaluate_settings(validation, settings, catalysts, confidence, {}, horizon)

    ranked = rank_indicators(datasets, horizon, catalysts)
    rankings = []
    for row in ranked["rankings"]:
        key = str(row["key"])
        rankings.append(
            {
                **row,
                "learnedWeight": settings[key]["weight"],
                "enabled": settings[key]["enabled"],
            }
        )

    coefficients = [
        {
            "key": str(INDICATOR_CATALOG[i]["key"]),
            "label": str(INDICATOR_CATALOG[i]["label"]),
            "directionWeight": direction_model.weights[i],
            "returnWeight": return_model.weights[i],
            "enabled": settings[str(INDICATOR_CATALOG[i]["key"])]["enabled"],
        }
        for i in range(len(INDICATOR_CATALOG))
    ]
    coefficients.sort(key=lambda row: abs(row["directionWeight"]), reverse=True)

    enabled_count = sum(1 for item in INDICATOR_CATALOG if settings[str(item["key"])]["enabled"])

    return {
        "settings": settings,
        "rankings": rankings,
        "totalRows": len(samples),
        "trainRows": len(train),
        "validationRows": len(validation),
        "method": "autonomous",
        "validation": val_metrics,
        "coefficients": coefficients,
        "enabledIndicators": enabled_count,
        "scalerMeans": scaler.means,
        "scalerScales": scaler.scales,
        "directionBias": direction_model.bias,
        "returnBias": return_model.bias,
    }


def refine_weights_coordinate_descent(
    datasets: list[dict[str, Any]],
    horizon: int,
    catalysts: dict[str, float],
    initial_settings: dict[str, dict[str, Any]],
    train_fraction: float = 0.7,
    confidence: float = 0.56,
    rounds: int = 2,
    grid: list[float] | None = None,
) -> dict[str, Any]:
    """Optional polish: coordinate search on validation hit rate starting from logistic weights."""
    samples = collect_samples(datasets, horizon, catalysts)
    split = int(len(samples) * train_fraction)
    validation = samples[split:]
    settings = {k: dict(v) for k, v in initial_settings.items()}
    grid = grid or [-2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 2.5]

    best_hit = -1.0
    for _ in range(rounds):
        for item in INDICATOR_CATALOG:
            key = str(item["key"])
            best_w = float(settings[key]["weight"])
            best_local = best_hit
            for weight in grid:
                trial = {k: dict(v) for k, v in settings.items()}
                trial[key] = {**trial[key], "weight": weight, "enabled": abs(weight) >= 0.04}
                metrics = _evaluate_settings(validation, trial, catalysts, confidence, {}, horizon)
                if metrics["hitRate"] > best_local and metrics["signalCount"] >= 5:
                    best_local = metrics["hitRate"]
                    best_w = weight
            settings[key]["weight"] = best_w
            settings[key]["enabled"] = abs(best_w) >= 0.04
        best_hit = _evaluate_settings(validation, settings, catalysts, confidence, {}, horizon)["hitRate"]

    val_metrics = _evaluate_settings(validation, settings, catalysts, confidence, {}, horizon)
    return {"settings": settings, "validation": val_metrics, "method": "autonomous+refined"}
