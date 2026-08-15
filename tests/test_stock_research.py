from market_predictor.data import PriceRow
from market_predictor.stock_research import _news_relevance, build_history_summary


def _rows(count=300):
    rows = []
    close = 100.0
    for day in range(count):
        close += 0.2 if day % 3 else -0.1
        rows.append(
            PriceRow(
                date=f"2026-01-{(day % 28) + 1:02d}",
                open=close - 0.5,
                high=close + 1.0,
                low=close - 1.0,
                close=close,
                volume=1_000_000 + day * 1000,
                extras={},
            )
        )
    return rows


def test_history_summary_includes_research_metrics():
    summary = build_history_summary(_rows())

    assert summary["history"]["rows"] == 300
    assert summary["history"]["return5d"] is not None
    assert summary["volatility"]["realized20d"] is not None
    assert summary["volume"]["relativeVolume20d"] is not None
    assert 0 <= summary["volume"]["buyPressure20d"] <= 1
    assert summary["indicators"]["sma50"] is not None
    assert summary["indicators"]["rsi14"] is not None
    assert summary["analysis"]["trend"] in {"uptrend", "downtrend", "mixed"}
    assert summary["analysis"]["observations"]


def test_news_relevance_requires_the_ticker_or_company_name():
    assert _news_relevance("NVDA", "NVIDIA Corporation", "Nvidia launches a new accelerator", None) == "company"
    assert _news_relevance("NVDA", "NVIDIA Corporation", "Analyst raises $NVDA target", None) == "ticker"
    assert _news_relevance("NVDA", "NVIDIA Corporation", "Berkshire increases its Alphabet stake", "Google moved higher") is None
    assert _news_relevance("A", "Agilent Technologies, Inc.", "Markets rally after a volatile session", None) is None
    assert _news_relevance("A", "Agilent Technologies, Inc.", "Agilent launches a new instrument", None) == "company"
    assert _news_relevance("T", "AT&T Inc.", "AT&T expands its fiber footprint", None) == "company"
