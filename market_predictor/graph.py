import json
from typing import Any, Dict, TypedDict
from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
import os

class InvestmentThesis(BaseModel):
    executive_summary: str = Field(description="A 2-3 sentence overarching summary of the stock's current position and outlook.")
    bull_case: str = Field(description="The primary bull case based on recent news and technical indicators.")
    bear_case: str = Field(description="The primary bear case, highlighting risks and negative sentiment.")
    sentiment_score: int = Field(description="An overall sentiment score from 1 (extremely bearish) to 10 (extremely bullish).")

class AgentState(TypedDict):
    ticker: str
    news_data: dict[str, Any]
    technical_data: dict[str, Any]
    prediction_data: dict[str, Any]
    quant_analysis: str
    final_thesis: dict[str, Any]
    api_key: str | None

def quant_node(state: AgentState) -> dict:
    """The Quant focuses purely on the numbers and model prediction."""
    # In a real setup, this might query an LLM just for technicals, but we'll do a deterministic formatting
    pred = state["prediction_data"]
    techs = state["technical_data"]
    
    if not pred or not pred.get("probability_up"):
        analysis = "No valid quantitative prediction available."
    else:
        prob = pred["probability_up"]
        analysis = f"Quant Analysis: Model predicts a {prob*100:.1f}% chance of upward movement over the horizon. Expected return: {pred.get('expected_return', 0)*100:.1f}%."
    return {"quant_analysis": analysis}

def editor_node(state: AgentState) -> dict:
    """The Editor synthesizes all data into the final thesis."""
    api_key = state.get("api_key") or os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return {"final_thesis": {
            "executive_summary": "API Key missing. Enter your OpenAI API key in settings.",
            "bull_case": "N/A", "bear_case": "N/A", "sentiment_score": 5
        }}

    llm = ChatOpenAI(model="gpt-4o-mini", temperature=0, api_key=api_key)
    structured_llm = llm.with_structured_output(InvestmentThesis)
    
    prompt = f"""
    You are the Editor of a premier AI hedge fund. Synthesize the following into a structured thesis for {state['ticker']}.
    
    NEWS:
    {json.dumps(state['news_data'], indent=2)}
    
    QUANTITATIVE ANALYSIS:
    {state['quant_analysis']}
    
    TECHNICALS (Excerpt):
    Market Cap: {state['technical_data'].get('fundamentals', {}).get('marketCap', 'Unknown')}
    """

    try:
        result = structured_llm.invoke([
            SystemMessage(content="You are a senior hedge fund analyst providing structured output."),
            HumanMessage(content=prompt)
        ])
        return {"final_thesis": result.model_dump()}
    except Exception as e:
        print(f"Error in Editor Node: {e}")
        return {"final_thesis": {}}

# Build the Graph
workflow = StateGraph(AgentState)
workflow.add_node("quant", quant_node)
workflow.add_node("editor", editor_node)

workflow.set_entry_point("quant")
workflow.add_edge("quant", "editor")
workflow.add_edge("editor", END)

app = workflow.compile()

def synthesize_research_graph(ticker: str, news_data: dict[str, Any], technical_data: dict[str, Any], prediction_data: dict[str, Any], api_key: str | None = None) -> dict[str, Any]:
    initial_state = {
        "ticker": ticker,
        "news_data": news_data,
        "technical_data": technical_data,
        "prediction_data": prediction_data,
        "quant_analysis": "",
        "final_thesis": {},
        "api_key": api_key
    }
    
    # Run the graph
    result = app.invoke(initial_state)
    return result["final_thesis"]