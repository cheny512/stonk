import json
import os
import sys
from pathlib import Path
from typing import Any

from mcp.server.fastmcp import FastMCP

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.live_data import load_ticker_rows
from market_predictor.stock_research import build_stock_research, fetch_current_events
from market_predictor.ui_model import latest_signal_test, DEFAULT_CATALYSTS

# Initialize FastMCP server
mcp = FastMCP("Stonk API")

def _load_trained_model() -> dict[str, Any]:
    model_path = ROOT / "data" / "trained_model.json"
    if model_path.exists():
        with open(model_path, "r") as f:
            return json.load(f)
    return {}

@mcp.tool()
def get_recent_news(ticker: str) -> dict[str, Any]:
    """Fetch the latest real-world news and current events for a stock ticker."""
    return fetch_current_events(ticker, limit=5)

@mcp.tool()
def get_technical_research(ticker: str) -> dict[str, Any]:
    """Fetch the technical summary and fundamentals for a stock ticker."""
    try:
        rows = load_ticker_rows(ticker)
        return build_stock_research(ticker, rows, include_fundamentals=True)
    except FileNotFoundError:
        return {"error": f"No historical data found for {ticker}."}
    except Exception as exc:
        return {"error": str(exc)}

@mcp.tool()
def get_model_prediction(ticker: str) -> dict[str, Any]:
    """Fetch the AI/ML model prediction for a given ticker's price movement."""
    try:
        rows = load_ticker_rows(ticker)
        model_data = _load_trained_model()
        settings = model_data.get("settings")
        if not settings:
            return {"error": "Trained model settings not found. Please train the model first."}
        
        result = latest_signal_test(
            rows=rows,
            ticker=ticker.upper(),
            horizon=5,
            confidence=0.56,
            settings=settings,
            catalysts=DEFAULT_CATALYSTS,
            dte=30,
            iv=0.4,
            trade_cost=0.001,
            train_fraction=0.7
        )
        return {
            "ticker": ticker.upper(),
            "probability_up": result.get("probability"),
            "signal": result.get("signal"),
            "expected_return": result.get("expectedReturn"),
            "features": result.get("features")
        }
    except FileNotFoundError:
        return {"error": f"No historical data found for {ticker}."}
    except Exception as exc:
        return {"error": str(exc)}

if __name__ == "__main__":
    # Run the MCP server over standard input/output
    mcp.run(transport='stdio')
