from __future__ import annotations

import random
import pytest
from typing import Any
from dataclasses import dataclass
from market_predictor.data import PriceRow

@pytest.fixture
def seeded_rng():
    """Returns a random.Random instance with a fixed seed."""
    return random.Random(42)

@pytest.fixture
def tmp_dataset():
    """Yields a list of PriceRow objects for testing."""
    return [
        PriceRow(
            date=f"2024-01-{i+1:02d}", 
            open=100.0 + i, 
            high=105.0 + i, 
            low=95.0 + i, 
            close=102.0 + i, 
            volume=1000000 + i*1000,
            extras={}
        )
        for i in range(30)
    ]

class FakeStructuredLLM:
    def __init__(self, output: Any):
        self.output = output

    def invoke(self, messages: list[Any]) -> Any:
        return self.output

class FakeLLM:
    def __init__(self, output: Any):
        self.output = output

    def with_structured_output(self, schema: Any) -> FakeStructuredLLM:
        return FakeStructuredLLM(self.output)

@pytest.fixture
def fake_llm():
    """Returns a fake LLM for testing LangGraph nodes."""
    from market_predictor.graph import InvestmentThesis
    thesis = InvestmentThesis(
        executive_summary="The outlook is positive with strong technical momentum.",
        bull_case="RSI is oversold and news is bullish.",
        bear_case="Potential resistance at higher levels.",
        sentiment_score=8
    )
    return FakeLLM(thesis)
