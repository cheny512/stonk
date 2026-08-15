from __future__ import annotations

from typing import Any

from market_predictor.graph import configured_provider, synthesize_research_graph
from market_predictor.research_packet import InvestmentThesis

__all__ = ["InvestmentThesis", "configured_provider", "synthesize_research"]


def synthesize_research(
    ticker: str,
    news_data: dict[str, Any],
    technical_data: dict[str, Any],
    prediction_data: dict[str, Any],
) -> dict[str, Any]:
    return synthesize_research_graph(ticker, news_data, technical_data, prediction_data)
