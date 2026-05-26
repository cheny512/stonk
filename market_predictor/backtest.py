from __future__ import annotations

import math
from dataclasses import dataclass

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


def _max_drawdown(curve: list[float]) -> float:
    peak = 0.0
    worst = 0.0
    for value in curve:
        peak = max(peak, value)
        worst = min(worst, value - peak)
    return abs(worst)


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

