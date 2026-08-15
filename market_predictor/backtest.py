from __future__ import annotations

import math
from dataclasses import dataclass
from statistics import NormalDist

from .features import Example
from .models import StandardScaler, train_linear, train_logistic


@dataclass(frozen=True)
class BacktestTrade:
    date: str
    side: str
    probability_up: float
    predicted_return: float
    realized_return: float
    pnl: float


@dataclass(frozen=True)
class BacktestResult:
    total_examples: int
    train_examples: int
    test_examples: int
    accuracy_all: float
    signal_count: int
    signal_hit_rate: float
    avg_signal_return: float
    avg_signal_pnl: float
    cumulative_pnl: float
    max_drawdown: float
    brier_score: float
    trades: list[BacktestTrade]


@dataclass(frozen=True)
class WalkForwardFold:
    fold: int
    train_start: str
    train_end: str
    test_start: str
    test_end: str
    train_examples: int
    test_examples: int
    signal_count: int
    strategy_return: float
    benchmark_return: float


@dataclass(frozen=True)
class WalkForwardResult:
    """Auditable expanding-window validation summary.

    `purge_gap` prevents training labels from crossing into the test window and
    `holding_period` controls overlapping positions. Returns are compounded,
    unlike the legacy cumulative-PnL diagnostic retained for compatibility.
    """

    validation_scheme: str
    benchmark_name: str
    holding_period: int
    purge_gap: int
    folds: list[WalkForwardFold]
    evaluated_examples: int
    signal_count: int
    signal_hit_rate: float
    hit_rate_ci_95: tuple[float, float]
    accuracy_all: float
    brier_score: float
    strategy_return: float
    benchmark_return: float
    excess_return: float
    max_drawdown: float
    sharpe_ratio: float | None
    exposure_rate: float
    trades: list[BacktestTrade]


def _max_drawdown(curve: list[float]) -> float:
    peak = 0.0
    worst = 0.0
    for value in curve:
        peak = max(peak, value)
        worst = min(worst, value - peak)
    return abs(worst)


def _equity_max_drawdown(returns_: list[float]) -> float:
    equity = 1.0
    peak = 1.0
    worst = 0.0
    for value in returns_:
        equity *= max(0.0, 1.0 + value)
        peak = max(peak, equity)
        if peak:
            worst = max(worst, 1.0 - equity / peak)
    return worst


def _compound(returns_: list[float]) -> float:
    equity = 1.0
    for value in returns_:
        equity *= max(0.0, 1.0 + value)
    return equity - 1.0


def _wilson_interval(successes: int, total: int, confidence: float = 0.95) -> tuple[float, float]:
    if total <= 0:
        return (0.0, 0.0)
    z = NormalDist().inv_cdf(0.5 + confidence / 2.0)
    proportion = successes / total
    denominator = 1.0 + z * z / total
    centre = (proportion + z * z / (2.0 * total)) / denominator
    radius = (
        z
        * math.sqrt((proportion * (1.0 - proportion) + z * z / (4.0 * total)) / total)
        / denominator
    )
    return (
        min(proportion, max(0.0, centre - radius)),
        max(proportion, min(1.0, centre + radius)),
    )


def _annualized_sharpe(returns_: list[float], holding_period: int) -> float | None:
    if len(returns_) < 2:
        return None
    average = sum(returns_) / len(returns_)
    variance = sum((value - average) ** 2 for value in returns_) / (len(returns_) - 1)
    if variance <= 0:
        return None
    periods = 252 / max(1, holding_period)
    return average / math.sqrt(variance) * math.sqrt(periods)


def _fit_models(examples: list[Example]):
    scaler = StandardScaler.fit([example.x for example in examples])
    x_train = scaler.transform([example.x for example in examples])
    direction_model = train_logistic(x_train, [example.y_up for example in examples])
    return_model = train_linear(x_train, [example.y_return for example in examples])
    return scaler, direction_model, return_model


def run_walk_forward_backtest(
    examples: list[Example],
    *,
    min_train_size: int = 252,
    test_size: int = 63,
    holding_period: int = 5,
    purge_gap: int | None = None,
    confidence: float = 0.56,
    transaction_cost: float = 0.001,
    allow_overlapping: bool = False,
) -> WalkForwardResult:
    """Run an expanding-window backtest with a purged train/test boundary.

    The caller must construct point-in-time features. A purge at least as large
    as the holding period is enforced so a training label cannot include prices
    from the test window. Non-overlapping evaluation is the default because a
    horizon return otherwise counts simultaneous positions as independent bets.
    """
    if holding_period < 1:
        raise ValueError("holding_period must be at least 1")
    if test_size < 1:
        raise ValueError("test_size must be at least 1")
    if min_train_size < 80:
        raise ValueError("min_train_size must be at least 80")
    gap = holding_period if purge_gap is None else purge_gap
    if gap < holding_period:
        raise ValueError("purge_gap must be at least the holding_period")
    if len(examples) < min_train_size + gap + test_size:
        raise ValueError("Not enough examples for one complete walk-forward fold")
    if any(examples[index].date > examples[index + 1].date for index in range(len(examples) - 1)):
        raise ValueError("Examples must be sorted chronologically")

    folds: list[WalkForwardFold] = []
    trades: list[BacktestTrade] = []
    strategy_returns: list[float] = []
    benchmark_fold_returns: list[float] = []
    correct = 0
    brier = 0.0
    evaluated = 0
    signal_hits = 0
    fold_index = 0
    test_start = min_train_size + gap

    while test_start < len(examples):
        test_end = min(test_start + test_size, len(examples))
        if test_end - test_start < max(5, min(test_size, holding_period)):
            break
        train = examples[: test_start - gap]
        test = examples[test_start:test_end]
        scaler, direction_model, return_model = _fit_models(train)
        fold_returns: list[float] = []
        fold_signals = 0

        step = 1 if allow_overlapping else holding_period
        selected_indexes = set(range(0, len(test), step))
        for index, example in enumerate(test):
            x = scaler.transform_one(example.x)
            probability_up = direction_model.predict_proba(x)
            predicted_return = return_model.predict(x)
            predicted_up = probability_up >= 0.5
            correct += int(predicted_up == bool(example.y_up))
            brier += (probability_up - example.y_up) ** 2
            evaluated += 1

            if index not in selected_indexes:
                continue
            direction = 1 if probability_up >= confidence else -1 if probability_up <= 1.0 - confidence else 0
            if not direction:
                continue
            side = "long" if direction > 0 else "short"
            pnl = direction * example.y_return - transaction_cost
            signal_hits += int((direction > 0 and example.y_return > 0) or (direction < 0 and example.y_return < 0))
            fold_signals += 1
            fold_returns.append(pnl)
            strategy_returns.append(pnl)
            trades.append(
                BacktestTrade(
                    date=example.date,
                    side=side,
                    probability_up=probability_up,
                    predicted_return=predicted_return,
                    realized_return=example.y_return,
                    pnl=pnl,
                )
            )

        first_close = test[0].close
        last_close = test[-1].close
        benchmark_return = last_close / first_close - 1.0 if first_close > 0 else 0.0
        benchmark_fold_returns.append(benchmark_return)
        folds.append(
            WalkForwardFold(
                fold=fold_index,
                train_start=train[0].date,
                train_end=train[-1].date,
                test_start=test[0].date,
                test_end=test[-1].date,
                train_examples=len(train),
                test_examples=len(test),
                signal_count=fold_signals,
                strategy_return=_compound(fold_returns),
                benchmark_return=benchmark_return,
            )
        )
        fold_index += 1
        test_start = test_end

    signal_count = len(trades)
    strategy_return = _compound(strategy_returns)
    benchmark_return = _compound(benchmark_fold_returns)
    eligible_slots = sum(math.ceil(fold.test_examples / (1 if allow_overlapping else holding_period)) for fold in folds)
    return WalkForwardResult(
        validation_scheme="expanding-window-purged",
        benchmark_name="underlying-buy-and-hold",
        holding_period=holding_period,
        purge_gap=gap,
        folds=folds,
        evaluated_examples=evaluated,
        signal_count=signal_count,
        signal_hit_rate=signal_hits / signal_count if signal_count else 0.0,
        hit_rate_ci_95=_wilson_interval(signal_hits, signal_count),
        accuracy_all=correct / evaluated if evaluated else 0.0,
        brier_score=brier / evaluated if evaluated else 0.0,
        strategy_return=strategy_return,
        benchmark_return=benchmark_return,
        excess_return=strategy_return - benchmark_return,
        max_drawdown=_equity_max_drawdown(strategy_returns),
        sharpe_ratio=_annualized_sharpe(strategy_returns, holding_period),
        exposure_rate=signal_count / eligible_slots if eligible_slots else 0.0,
        trades=trades,
    )


def run_backtest(
    examples: list[Example],
    train_fraction: float = 0.7,
    confidence: float = 0.56,
    transaction_cost: float = 0.001,
) -> BacktestResult:
    if len(examples) < 80:
        raise ValueError("Need at least 80 examples for a meaningful backtest")
    split = int(len(examples) * train_fraction)
    train = examples[:split]
    test = examples[split:]
    scaler = StandardScaler.fit([ex.x for ex in train])
    x_train = scaler.transform([ex.x for ex in train])
    y_up = [ex.y_up for ex in train]
    y_return = [ex.y_return for ex in train]
    direction_model = train_logistic(x_train, y_up)
    return_model = train_linear(x_train, y_return)

    correct = 0
    brier = 0.0
    trades: list[BacktestTrade] = []
    curve: list[float] = []
    cumulative = 0.0
    for ex in test:
        x = scaler.transform_one(ex.x)
        probability_up = direction_model.predict_proba(x)
        predicted_return = return_model.predict(x)
        predicted_up = 1 if probability_up >= 0.5 else 0
        correct += 1 if predicted_up == ex.y_up else 0
        brier += (probability_up - ex.y_up) ** 2

        side = "flat"
        trade_direction = 0
        if probability_up >= confidence:
            side = "long"
            trade_direction = 1
        elif probability_up <= 1.0 - confidence:
            side = "short"
            trade_direction = -1

        if trade_direction:
            pnl = trade_direction * ex.y_return - transaction_cost
            cumulative += pnl
            trades.append(
                BacktestTrade(
                    date=ex.date,
                    side=side,
                    probability_up=probability_up,
                    predicted_return=predicted_return,
                    realized_return=ex.y_return,
                    pnl=pnl,
                )
            )
        curve.append(cumulative)

    signal_hits = 0
    for trade in trades:
        if (trade.side == "long" and trade.realized_return > 0) or (
            trade.side == "short" and trade.realized_return < 0
        ):
            signal_hits += 1
    signal_count = len(trades)
    return BacktestResult(
        total_examples=len(examples),
        train_examples=len(train),
        test_examples=len(test),
        accuracy_all=correct / len(test),
        signal_count=signal_count,
        signal_hit_rate=signal_hits / signal_count if signal_count else 0.0,
        avg_signal_return=sum(abs(t.realized_return) for t in trades) / signal_count if signal_count else 0.0,
        avg_signal_pnl=sum(t.pnl for t in trades) / signal_count if signal_count else 0.0,
        cumulative_pnl=cumulative,
        max_drawdown=_max_drawdown(curve),
        brier_score=brier / len(test),
        trades=trades,
    )


def annualized_realized_vol(examples: list[Example]) -> float:
    returns = [ex.y_return for ex in examples[-60:]]
    if len(returns) < 2:
        return 0.0
    avg = sum(returns) / len(returns)
    var = sum((v - avg) ** 2 for v in returns) / (len(returns) - 1)
    # y_return is horizon return, so this is a conservative direct annualization proxy.
    return math.sqrt(max(var, 0.0)) * math.sqrt(252)
