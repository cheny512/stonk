from market_predictor.data import PriceRow, attach_events, equity_bars_to_price_rows
from market_predictor.data_providers.types import EquityBar


def test_equity_bars_to_price_rows():
    bars = [
        EquityBar("2025-01-02", 100, 103, 99, 102, 1_000_000),
        EquityBar("2025-01-03", 102, 104, 101, 103, 1_100_000),
    ]
    rows = equity_bars_to_price_rows(bars)
    assert len(rows) == 2
    assert rows[0].close == 102


def test_attach_events_merges_extras():
    base = PriceRow("2025-01-02", 1, 2, 0.5, 1.5, 100, {})
    merged = attach_events([base], {"2025-01-02": {"earnings_surprise": 0.2}})
    assert merged[0].extras["earnings_surprise"] == 0.2
