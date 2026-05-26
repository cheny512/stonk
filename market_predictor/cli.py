from __future__ import annotations

import argparse
import json
import math
from dataclasses import asdict

from .backtest import annualized_realized_vol, run_backtest
from .data import attach_events, load_event_csv, load_price_csv
from .features import BASE_FEATURES, build_examples, feature_at
from .models import StandardScaler, top_coefficients, train_linear, train_logistic
from .options import score_options_setup


def _load_inputs(args: argparse.Namespace):
    rows = load_price_csv(args.prices)
    if args.events:
        rows = attach_events(rows, load_event_csv(args.events))
    benchmark = load_price_csv(args.benchmark) if args.benchmark else None
    examples = build_examples(rows, horizon=args.horizon, benchmark_rows=benchmark)
    return rows, benchmark, examples


def _format_pct(value: float) -> str:
    return f"{value * 100:.2f}%"


def command_backtest(args: argparse.Namespace) -> int:
    _, _, examples = _load_inputs(args)
    result = run_backtest(
        examples,
        train_fraction=args.train_fraction,
        confidence=args.confidence,
        transaction_cost=args.transaction_cost,
    )
    if args.json:
        print(json.dumps(asdict(result), indent=2))
        return 0

    print(f"Backtest for {args.ticker or 'ticker'}")
    print(f"Examples: {result.total_examples} ({result.train_examples} train / {result.test_examples} test)")
    print(f"All prediction accuracy: {_format_pct(result.accuracy_all)}")
    print(f"Signal count: {result.signal_count}")
    print(f"Signal hit rate: {_format_pct(result.signal_hit_rate)}")
    print(f"Average signal realized move: {_format_pct(result.avg_signal_return)}")
    print(f"Average signal PnL proxy: {_format_pct(result.avg_signal_pnl)}")
    print(f"Cumulative PnL proxy: {_format_pct(result.cumulative_pnl)}")
    print(f"Max drawdown proxy: {_format_pct(result.max_drawdown)}")
    print(f"Brier score: {result.brier_score:.4f}")
    print()
    print("PnL proxy is stock-return direction minus transaction cost, not an options PnL.")
    return 0


def command_predict(args: argparse.Namespace) -> int:
    rows, benchmark, examples = _load_inputs(args)
    backtest = run_backtest(
        examples,
        train_fraction=args.train_fraction,
        confidence=args.confidence,
        transaction_cost=args.transaction_cost,
    )

    scaler = StandardScaler.fit([ex.x for ex in examples])
    x_train = scaler.transform([ex.x for ex in examples])
    direction_model = train_logistic(x_train, [ex.y_up for ex in examples])
    return_model = train_linear(x_train, [ex.y_return for ex in examples])

    latest = rows[-1]
    latest_x = scaler.transform_one(feature_at(rows, len(rows) - 1, benchmark))
    probability_up = direction_model.predict_proba(latest_x)
    predicted_return = return_model.predict(latest_x)

    recent_abs_horizon_move = sum(abs(ex.y_return) for ex in examples[-40:]) / min(40, len(examples))
    confidence_boost = 1.0 + max(0.0, abs(probability_up - 0.5) - 0.05)
    expected_abs_move = max(abs(predicted_return), recent_abs_horizon_move * confidence_boost)

    options = score_options_setup(
        probability_up=probability_up,
        predicted_return=predicted_return,
        realized_abs_move_pct=expected_abs_move,
        days_to_expiry=args.days_to_expiry,
        implied_vol=args.implied_vol,
        confidence=args.confidence,
    )
    top = top_coefficients(BASE_FEATURES, direction_model.weights, limit=8)
    payload = {
        "ticker": args.ticker,
        "as_of": latest.date,
        "close": latest.close,
        "horizon_days": args.horizon,
        "probability_up": probability_up,
        "predicted_return": predicted_return,
        "expected_abs_move": expected_abs_move,
        "annualized_realized_vol_proxy": annualized_realized_vol(examples),
        "backtest": asdict(backtest),
        "options": asdict(options),
        "top_direction_coefficients": top,
    }
    if args.json:
        print(json.dumps(payload, indent=2))
        return 0

    ticker = args.ticker or "ticker"
    print(f"{ticker} forecast as of {latest.date} at close {latest.close:.2f}")
    print(f"Horizon: {args.horizon} trading days")
    print(f"Probability up: {_format_pct(probability_up)}")
    print(f"Predicted return: {_format_pct(predicted_return)}")
    print(f"Expected absolute move: {_format_pct(expected_abs_move)}")
    print()
    print("Backtest gate")
    print(f"Signal hit rate: {_format_pct(backtest.signal_hit_rate)} on {backtest.signal_count} signals")
    print(f"Avg signal PnL proxy: {_format_pct(backtest.avg_signal_pnl)}")
    print(f"Max drawdown proxy: {_format_pct(backtest.max_drawdown)}")
    print()
    print("Options read")
    print(f"Bias: {options.bias}")
    if args.implied_vol and args.days_to_expiry:
        print(f"Implied move: {_format_pct(options.implied_move_pct)}")
        print(f"Movement edge: {_format_pct(options.movement_edge_pct)}")
    print(f"Setup: {options.setup}")
    print(f"Risk: {options.risk_note}")
    print()
    print("Largest directional coefficients")
    for name, weight in top:
        print(f"- {name}: {weight:.4f}")
    print()
    print("Do not trade this live until it survives out-of-sample and paper-trade validation.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Stock movement and options setup research tool")
    sub = parser.add_subparsers(dest="command", required=True)

    def add_common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--prices", required=True, help="Daily OHLCV CSV path")
        p.add_argument("--benchmark", help="Optional benchmark OHLCV CSV path, e.g. SPY")
        p.add_argument("--events", help="Optional event/factor CSV path")
        p.add_argument("--ticker", default="", help="Ticker label for output")
        p.add_argument("--horizon", type=int, default=5, help="Prediction horizon in trading days")
        p.add_argument("--confidence", type=float, default=0.56, help="Directional signal threshold")
        p.add_argument("--train-fraction", type=float, default=0.7, help="Chronological train split")
        p.add_argument("--transaction-cost", type=float, default=0.001, help="Backtest round-trip cost proxy")
        p.add_argument("--json", action="store_true", help="Emit JSON")

    backtest = sub.add_parser("backtest", help="Run chronological backtest")
    add_common(backtest)
    backtest.set_defaults(func=command_backtest)

    predict = sub.add_parser("predict", help="Predict latest movement and score options setup")
    add_common(predict)
    predict.add_argument("--days-to-expiry", type=int, help="Option days to expiration")
    predict.add_argument("--implied-vol", type=float, help="Option implied volatility as decimal, e.g. 0.45")
    predict.set_defaults(func=command_predict)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if not 0.5 < args.confidence < 0.9:
        parser.error("--confidence must be between 0.5 and 0.9")
    if not 0.5 <= args.train_fraction < 0.95:
        parser.error("--train-fraction must be between 0.5 and 0.95")
    if args.horizon < 1 or args.horizon > 60:
        parser.error("--horizon must be between 1 and 60")
    if getattr(args, "implied_vol", None) is not None and (args.implied_vol <= 0 or math.isnan(args.implied_vol)):
        parser.error("--implied-vol must be positive")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())

