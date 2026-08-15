from datetime import date, timedelta

from market_predictor.data import PriceRow
from market_predictor.ui_model import DEFAULT_CATALYSTS
from market_predictor.weight_optimizer import train_autonomous_weights


def test_autonomous_training_produces_settings():
    start = date(2020, 1, 1)
    rows = [
        PriceRow(
            date=(start + timedelta(days=index)).isoformat(),
            open=100 + index * 0.08,
            high=101.5 + index * 0.08,
            low=99 + index * 0.08,
            close=100.5 + index * 0.08 + (index % 9 - 4) * 0.12,
            volume=1_000_000 + (index % 20) * 10_000,
            extras={},
        )
        for index in range(320)
    ]
    datasets = [{"ticker": "AAPL", "rows": rows}]
    result = train_autonomous_weights(datasets, horizon=5, catalysts=DEFAULT_CATALYSTS, epochs=200)
    assert result["method"] == "autonomous"
    assert result["enabledIndicators"] >= 1
    assert "validation" in result
    assert result["validation"]["accuracy"] >= 0
    settings = result["settings"]
    assert "momentum20" in settings
    assert isinstance(settings["momentum20"]["weight"], float)
