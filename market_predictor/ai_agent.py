import json
import os
from typing import Any

from pydantic import BaseModel, Field

# Fallback/Offline Schema
class InvestmentThesis(BaseModel):
    executive_summary: str = Field(description="A 2-3 sentence overarching summary of the stock's current position and outlook.")
    bull_case: str = Field(description="The primary bull case based on recent news and technical indicators.")
    bear_case: str = Field(description="The primary bear case, highlighting risks and negative sentiment.")
    sentiment_score: int = Field(description="An overall sentiment score from 1 (extremely bearish) to 10 (extremely bullish).")

def synthesize_research(ticker: str, news_data: dict[str, Any], technical_data: dict[str, Any], prediction_data: dict[str, Any]) -> dict[str, Any]:
    """Uses LangGraph multi-agent orchestration to synthesize raw market data into a structured investment thesis."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        # Graceful fallback if no API key is provided
        return {
            "executive_summary": f"AI synthesis is offline because OPENAI_API_KEY is not set. Data for {ticker} indicates normal market conditions.",
            "bull_case": "Model predicts potential upward momentum based on historical technicals.",
            "bear_case": "Macroeconomic factors and sector rotation pose continuous risks.",
            "sentiment_score": 5
        }

    from market_predictor.graph import synthesize_research_graph
    
    try:
        return synthesize_research_graph(ticker, news_data, technical_data, prediction_data)
    except Exception as e:
        print(f"Error during LangGraph synthesis: {e}")
        return {
            "executive_summary": f"Failed to synthesize research due to an API error.",
            "bull_case": "Data unavailable.",
            "bear_case": "Data unavailable.",
            "sentiment_score": 5
        }
