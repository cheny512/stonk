from market_predictor.ui_model import DEFAULT_CATALYSTS
from market_predictor.universe import load_ticker_rows
from market_predictor.weight_optimizer import train_autonomous_weights


def test_autonomous_training_produces_settings():
    rows = load_ticker_rows("AAPL")
    datasets = [{"ticker": "AAPL", "rows": rows}]
    result = train_autonomous_weights(datasets, horizon=5, catalysts=DEFAULT_CATALYSTS, epochs=200)
    assert result["method"] == "autonomous"
    assert result["enabledIndicators"] >= 1
    assert "validation" in result
    assert result["validation"]["accuracy"] >= 0
    settings = result["settings"]
    assert "momentum20" in settings
    assert isinstance(settings["momentum20"]["weight"], float)
