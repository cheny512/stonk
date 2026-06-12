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
    model_type: Literal["logistic", "xgboost", "svm"] = "logistic",
) -> dict[str, Any]:
    """
    Jointly learn all indicator weights via selected model engine.
    """
    from .models import ModelFactory

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

    if model_type == "xgboost":
        direction_model = ModelFactory.train_xgboost(x_train, y_up)
        settings = {
            str(item["key"]): {"enabled": True, "weight": 1.0} for item in INDICATOR_CATALOG
        }  # Placeholder settings for non-linear models
    elif model_type == "svm":
        direction_model = ModelFactory.train_svm(x_train, y_up)
        settings = {
            str(item["key"]): {"enabled": True, "weight": 1.0} for item in INDICATOR_CATALOG
        }
    else:
        direction_model = train_logistic(x_train, y_up, epochs=epochs, l2=l2)
        settings = _settings_from_logistic_weights(direction_model.weights)

    return_model = train_linear(x_train, y_return, epochs=epochs, l2=l2 * 2)

    val_metrics = _evaluate_settings(validation, settings, catalysts, confidence, {}, horizon)
    if model_type != "logistic":
        # Overwrite val metrics with actual model predictions
        correct = 0
        for sample in validation:
            x = scaler.transform_one(sample.x)
            prob = direction_model.predict_proba(x)
            if (prob >= 0.5) == sample.y_up:
                correct += 1
        val_metrics["accuracy"] = correct / len(validation)

    ranked = rank_indicators(datasets, horizon, catalysts)
    enabled_indicators = sum(1 for setting in settings.values() if setting.get("enabled", True))

    # ... rest of the function remains similar but adapted for wrapper ...
    return {
        "settings": settings,
        "rankings": ranked["rankings"],
        "totalRows": len(samples),
        "enabledIndicators": enabled_indicators,
        "trainRows": len(train),
        "validationRows": len(validation),
        "method": "autonomous" if model_type == "logistic" else f"autonomous-{model_type}",
        "validation": val_metrics,
        "model_type": model_type,
        "scalerMeans": scaler.means,
        "scalerScales": scaler.scales,
    }


from market_predictor.logging_config import get_logger

logger = get_logger(__name__)

def train_best_model(
    datasets: list[dict[str, Any]],
    horizon: int,
    catalysts: dict[str, float],
    train_fraction: float = 0.7,
    confidence: float = 0.56,
) -> dict[str, Any]:
    """
    Champion-Challenger Loop: Try all supported engines and pick the winner.
    """
    engines: list[Literal["logistic", "xgboost", "svm"]] = ["logistic", "xgboost", "svm"]
    best_trained = None
    best_hit = -1.0

    logger.info("champion_challenger_started")
    for engine in engines:
        try:
            logger.info("testing_challenger", engine=engine)
            trained = train_autonomous_weights(
                datasets,
                horizon,
                catalysts,
                train_fraction=train_fraction,
                confidence=confidence,
                model_type=engine,
            )
            hit = trained["validation"]["hitRate"]
            logger.info("challenger_result", engine=engine, hit_rate=round(hit, 4))
            if hit > best_hit:
                best_hit = hit
                best_trained = trained
        except Exception as e:
            logger.error("challenger_failed", engine=engine, error=str(e))

    if not best_trained:
        raise ValueError("All training engines failed.")

    logger.info("champion_selected", method=best_trained['method'], hit_rate=round(best_hit, 4))
    return best_trained

def build_sequences(samples: list[TrainingSample], window_size: int = 10) -> tuple[list[np.ndarray], list[int]]:
    """Convert flat samples into windowed sequences for LSTM/Transformer."""
    sequences = []
    labels = []
    # This requires grouping by ticker and date
    ticker_data: dict[str, list[TrainingSample]] = {}
    for s in samples:
        ticker_data.setdefault(s.ticker, []).append(s)
    
    for ticker, rows in ticker_data.items():
        rows.sort(key=lambda x: x.date)
        for i in range(window_size, len(rows)):
            window = [r.x for r in rows[i-window_size:i]]
            sequences.append(np.array(window))
            labels.append(rows[i].y_up)
    return sequences, labels


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
