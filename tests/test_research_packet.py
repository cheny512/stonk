from __future__ import annotations

import pytest

from market_predictor.research_packet import (
    GroundingError,
    InvestmentThesis,
    build_research_packet,
    validate_thesis_grounding,
)


def _packet():
    return build_research_packet(
        "aapl",
        {
            "provider": "fixture",
            "items": [
                {
                    "title": "Company files quarterly report",
                    "published": "2026-08-01",
                    "publisher": "SEC",
                    "url": "https://example.test/filing",
                }
            ],
        },
        {
            "history": {"end": "2026-08-01", "lastClose": 200.0},
            "indicators": {"trend": "uptrend", "rsi14": 61.0},
            "fundamentals": {"available": False},
        },
        {"probability_up": 0.61, "expected_return": 0.02},
    )


def test_packet_is_stable_and_assigns_source_ids():
    first = _packet()
    second = _packet()

    assert first.packet_id == second.packet_id
    assert first.ticker == "AAPL"
    assert {item.id for item in first.evidence} == {
        "price-history",
        "technical-indicators",
        "model-prediction",
        "event-1",
    }


def test_grounding_rejects_nonexistent_citation():
    thesis = InvestmentThesis(
        executive_summary="A claim",
        bull_case="Bull",
        bear_case="Bear",
        sentiment_score=6,
        evidence_citations=["invented-source"],
    )

    with pytest.raises(GroundingError, match="invented-source"):
        validate_thesis_grounding(thesis, _packet(), require_citations=True)


def test_grounding_requires_citations_for_generated_output():
    thesis = InvestmentThesis(
        executive_summary="A claim",
        bull_case="Bull",
        bear_case="Bear",
        sentiment_score=5,
    )

    with pytest.raises(GroundingError, match="did not cite"):
        validate_thesis_grounding(thesis, _packet(), require_citations=True)
