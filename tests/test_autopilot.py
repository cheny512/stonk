from datetime import date, timedelta

from market_predictor.autopilot import build_rules_thesis, build_trade_plan
from market_predictor.data import PriceRow


def _rows(count: int = 260) -> list[PriceRow]:
    start = date(2025, 1, 1)
    return [
        PriceRow(
            date=(start + timedelta(days=index)).isoformat(),
            open=100 + index * 0.18,
            high=102 + index * 0.18,
            low=99 + index * 0.18,
            close=101 + index * 0.18,
            volume=1_000_000 + index * 1_000,
            extras={},
        )
        for index in range(count)
    ]


def _signal() -> dict:
    return {
        "bias": "Bullish",
        "probabilityUp": 0.63,
        "expectedMove": 0.12,
        "backtest": {"hitRate": 0.58, "signalCount": 42, "profitFactor": 1.4},
    }


def test_trade_plan_has_entry_invalidation_targets_and_evidence():
    plan = build_trade_plan(_rows(), _signal(), horizon=5)

    assert plan["action"] == "Consider long"
    assert plan["entryZone"]["low"] <= plan["entryZone"]["high"]
    assert plan["invalidation"] < plan["entryZone"]["low"]
    assert plan["targets"][0] > plan["entryZone"]["low"]
    assert plan["evidence"]["historicallyValidated"] is True
    assert len(plan["exitRules"]) == 3


def test_trade_plan_refuses_weak_or_unattractive_setups():
    signal = _signal()
    signal["expectedMove"] = 0.01
    signal["backtest"] = {"hitRate": 0.48, "signalCount": 42, "profitFactor": 0.8}

    plan = build_trade_plan(_rows(), signal, horizon=5)

    assert plan["action"] == "No trade"
    assert plan["rejectionReasons"]
    assert plan["evidence"]["historicallyValidated"] is False
    assert "No entry" in plan["entryCondition"]


def test_rules_thesis_uses_measured_evidence_without_ai():
    research = {
        "history": {"return1y": 0.22, "drawdownFrom52wHigh": -0.08},
        "volatility": {"realized1y": 0.31},
        "indicators": {"trend": "uptrend", "rsi14": 61.2},
        "events": {"items": [{"title": "Company reports quarterly results"}]},
    }

    thesis = build_rules_thesis("aapl", _signal(), research, horizon=5)

    assert thesis["ticker"] == "AAPL"
    assert thesis["stance"] == "Bullish"
    assert thesis["conviction"] == "moderate"
    assert thesis["evidence"]
    assert "No generative AI" in thesis["methodology"]
