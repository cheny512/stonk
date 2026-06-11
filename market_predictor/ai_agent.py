import json
import os
from typing import Any

from pydantic import BaseModel, Field
from openai import OpenAI

class InvestmentThesis(BaseModel):
    executive_summary: str = Field(description="A 2-3 sentence overarching summary of the stock's current position and outlook.")
    bull_case: str = Field(description="The primary bull case based on recent news and technical indicators.")
    bear_case: str = Field(description="The primary bear case, highlighting risks and negative sentiment.")
    sentiment_score: int = Field(description="An overall sentiment score from 1 (extremely bearish) to 10 (extremely bullish).")

def synthesize_research(ticker: str, news_data: dict[str, Any], technical_data: dict[str, Any], prediction_data: dict[str, Any]) -> dict[str, Any]:
    """Uses OpenAI to synthesize raw market data into a structured investment thesis."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        # Graceful fallback if no API key is provided
        return {
            "executive_summary": f"AI synthesis is offline because OPENAI_API_KEY is not set. Data for {ticker} indicates normal market conditions.",
            "bull_case": "Model predicts potential upward momentum based on historical technicals.",
            "bear_case": "Macroeconomic factors and sector rotation pose continuous risks.",
            "sentiment_score": 5
        }

    client = OpenAI(api_key=api_key)
    
    prompt = f"""
    You are an expert quantitative AI financial analyst. Synthesize the following data for {ticker} into a clear, concise investment thesis.
    
    ## Current Events (News)
    {json.dumps(news_data, indent=2)}
    
    ## Technical Research
    {json.dumps(technical_data, indent=2)}
    
    ## ML Model Prediction
    {json.dumps(prediction_data, indent=2)}
    """

    try:
        completion = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "You are a senior hedge fund analyst providing structured output."},
                {"role": "user", "content": prompt}
            ],
            response_format=InvestmentThesis,
        )
        
        thesis = completion.choices[0].message.parsed
        if thesis:
            return thesis.model_dump()
        return {}
    except Exception as e:
        print(f"Error during OpenAI synthesis: {e}")
        return {
            "executive_summary": f"Failed to synthesize research due to an API error.",
            "bull_case": "Data unavailable.",
            "bear_case": "Data unavailable.",
            "sentiment_score": 5
        }
