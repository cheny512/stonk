from __future__ import annotations

import os
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import Counter, Histogram, make_asgi_app
from pydantic import BaseModel, Field
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import structlog
from market_predictor.logging_config import configure_logging, get_logger, request_id
from market_predictor.config import api_host, api_port
from market_predictor.insiders import fetch_insider_activity
from market_predictor.live_data import (
    fetch_ticker_history,
    get_live_quote,
    index_for_date,
    list_available_providers,
    load_ticker_rows,
)
from market_predictor.live_signals import generate_live_signals
from market_predictor.options_recommend import attach_options_to_signal
from market_predictor.stock_research import build_stock_research, fetch_current_events
from market_predictor.ai_agent import synthesize_research
from market_predictor.ui_model import (
    DEFAULT_CATALYSTS,
    INDICATOR_CATALOG,
    latest_signal_test,
    point_in_time_test,
    run_portfolio_backtest,
    rows_to_dicts,
    train_settings_from_correlations,
)
from market_predictor.universe import download_universe, list_universe, load_datasets
from market_predictor.weight_optimizer import refine_weights_coordinate_descent, train_autonomous_weights

# Configure structured logging
configure_logging()
logger = get_logger(__name__)

# Prometheus metrics
TRAIN_REQUESTS = Counter("stonk_train_requests_total", "Total train requests", ["model_kind"])
BACKTEST_REQUESTS = Counter("stonk_backtest_requests_total", "Total backtest requests")
LLM_CALLS = Counter("stonk_llm_calls_total", "Total LLM calls", ["outcome"])
REQUEST_LATENCY = Histogram("stonk_request_latency_seconds", "Request latency", ["route"])

# OpenAI Key from environment
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    get_logger(__name__).warning("openai_key_missing", message="AI features will be disabled")

limiter = Limiter(key_func=get_remote_address)
app = FastAPI(title="stonk API", version="0.3.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.mount("/metrics", make_asgi_app())

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def logging_middleware(request: Request, call_next):
    req_id = str(uuid.uuid4())
    token = request_id.set(req_id)
    structlog.contextvars.bind_contextvars(request_id=req_id)
    
    start_time = time.perf_counter()
    logger.info("request_started", method=request.method, path=request.url.path)
    
    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(
            "request_completed",
            method=request.method,
            path=request.url.path,
            status_code=response.status_code,
            duration_ms=round(duration_ms, 2)
        )
        return response
    finally:
        request_id.reset(token)
        structlog.contextvars.clear_contextvars()



class CatalystsBody(BaseModel):
    earningsSurprise: float = 0.15
    revenueSurprise: float = 0.05
    guidanceRevision: float = 0.15
    contractBacklog: float = 0.0
    newsSentiment: float = 0.1
    ceoCredibility: float = 0.05
    macroRates: float = -0.1
    sectorRelativeStrength: float = 0.1


class DownloadBody(BaseModel):
    years: int = Field(10, ge=1, le=30)
    limit: int | None = Field(None, ge=1, le=600)
    tickers: list[str] | None = None


class TrainBody(BaseModel):
    tickers: list[str]
    horizon: int = Field(5, ge=1, le=90)
    catalysts: CatalystsBody | None = None
    method: Literal["autonomous", "correlation"] = "autonomous"
    model_type: Literal["logistic", "xgboost", "svm"] = "logistic"
    refine: bool = Field(True, description="Polish autonomous weights on validation hit rate")
    train_fraction: float = Field(0.7, ge=0.5, le=0.9)
    confidence: float = Field(0.56, ge=0.51, le=0.9)


class PortfolioBody(BaseModel):
    tickers: list[str]
    horizon: int = Field(5, ge=1, le=90)
    confidence: float = Field(0.56, ge=0.51, le=0.9)
    settings: dict[str, dict[str, Any]]
    catalysts: CatalystsBody | None = None
    trade_cost: float = Field(0.001, ge=0, le=0.2)
    train_fraction: float = Field(0.7, ge=0.5, le=0.9)


class StockFetchBody(BaseModel):
    ticker: str
    years: int = Field(10, ge=1, le=30)
    provider: Literal["auto", "polygon", "yfinance"] = "auto"


class LiveSignalsBody(BaseModel):
    tickers: list[str]
    horizon: int = Field(5, ge=1, le=90)
    confidence: float = Field(0.56, ge=0.51, le=0.9)
    settings: dict[str, dict[str, Any]]
    catalysts: CatalystsBody | None = None
    dte: int = Field(21, ge=1, le=730)
    iv: float = Field(0.45, ge=0.01, le=3.0)
    trade_cost: float = Field(0.001, ge=0, le=0.2)
    train_fraction: float = Field(0.7, ge=0.5, le=0.9)
    refresh: bool = True
    include_options: bool = True


class StockTestBody(BaseModel):
    ticker: str
    mode: Literal["historical", "latest"] = "historical"
    include_options: bool = True
    cutoff_index: int | None = Field(None, ge=0)
    as_of: str | None = Field(None, description="YYYY-MM-DD for historical test")
    refresh: bool = False
    years: int = Field(10, ge=1, le=30)
    provider: Literal["auto", "polygon", "yfinance"] = "auto"
    horizon: int = Field(5, ge=1, le=90)
    confidence: float = Field(0.56, ge=0.51, le=0.9)
    settings: dict[str, dict[str, Any]]
    catalysts: CatalystsBody | None = None
    dte: int = Field(21, ge=1, le=730)
    iv: float = Field(0.45, ge=0.01, le=3.0)
    trade_cost: float = Field(0.001, ge=0, le=0.2)
    train_fraction: float = Field(0.7, ge=0.5, le=0.9)


def _catalysts_dict(body: CatalystsBody | None) -> dict[str, float]:
    if body is None:
        return dict(DEFAULT_CATALYSTS)
    return body.model_dump()


def _resolve_cutoff(rows, body: StockTestBody) -> int:
    if body.mode == "latest":
        return len(rows) - 1
    if body.as_of:
        return index_for_date(rows, body.as_of)
    if body.cutoff_index is not None:
        return body.cutoff_index
    return len(rows) - body.horizon - 2


@app.get("/api/health")
def api_health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/ai/health")
def ai_health() -> dict[str, bool]:
    return {"ai_enabled": bool(OPENAI_API_KEY)}


@app.get("/api/meta/indicators")
def indicators_meta() -> dict[str, Any]:
    return {"catalog": INDICATOR_CATALOG, "defaultCatalysts": DEFAULT_CATALYSTS}


@app.get("/api/meta/providers")
def providers_meta() -> dict[str, Any]:
    return list_available_providers()


@app.get("/api/universe")
def universe(only_ready: bool = False) -> dict[str, Any]:
    items = list_universe(only_ready=only_ready)
    ready = sum(1 for item in items if item.get("ready"))
    return {"tickers": items, "count": len(items), "ready": ready}


@app.post("/api/universe/download")
def universe_download(body: DownloadBody) -> dict[str, Any]:
    try:
        result = download_universe(tickers=body.tickers, years=body.years, limit=body.limit)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    items = list_universe(only_ready=True)
    return {**result, "readyCount": len(items)}


@app.post("/api/research/train")
def research_train(body: TrainBody) -> dict[str, Any]:
    TRAIN_REQUESTS.labels(model_kind=body.model_type).inc()
    if not body.tickers:
        raise HTTPException(status_code=400, detail="Select at least one ticker")
    with REQUEST_LATENCY.labels(route="/api/research/train").time():
        try:
            datasets = load_datasets(body.tickers)
            catalysts = _catalysts_dict(body.catalysts)
            if body.method == "correlation":
                trained = train_settings_from_correlations(datasets, body.horizon, catalysts)
            else:
                trained = train_autonomous_weights(
                    datasets,
                    body.horizon,
                    catalysts,
                    train_fraction=body.train_fraction,
                    confidence=body.confidence,
                    model_type=body.model_type,
                )
                if body.refine and body.model_type == "logistic":
                    polished = refine_weights_coordinate_descent(
                        datasets,
                        body.horizon,
                        catalysts,
                        trained["settings"],
                        train_fraction=body.train_fraction,
                        confidence=body.confidence,
                    )
                    trained["settings"] = polished["settings"]
                    trained["validation"] = polished["validation"]
                    trained["method"] = polished["method"]
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("train_failed", tickers=body.tickers)
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    return trained


@app.get("/api/research/model")
def get_trained_model() -> dict[str, Any]:
    path = ROOT / "data" / "trained_model.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="No trained model found. Run training first.")
    import json
    return json.loads(path.read_text())


@app.post("/api/live/signals")
def live_signals(body: LiveSignalsBody) -> dict[str, Any]:
    if not body.tickers:
        raise HTTPException(status_code=400, detail="Provide at least one ticker")
    if not body.settings:
        raise HTTPException(status_code=400, detail="Train the model first")
    try:
        return generate_live_signals(
            body.tickers,
            body.settings,
            body.horizon,
            body.confidence,
            _catalysts_dict(body.catalysts),
            body.dte,
            body.iv,
            body.trade_cost,
            body.train_fraction,
            body.refresh,
            body.include_options,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
@app.post("/api/research/portfolio")
def research_portfolio(body: PortfolioBody) -> dict[str, Any]:
    BACKTEST_REQUESTS.inc()
    if not body.tickers:
        raise HTTPException(status_code=400, detail="Select at least one ticker")
    with REQUEST_LATENCY.labels(route="/api/research/portfolio").time():
        try:
            datasets = load_datasets(body.tickers)
            portfolio = run_portfolio_backtest(
                datasets,
                body.horizon,
                body.confidence,
                body.settings,
                _catalysts_dict(body.catalysts),
                body.trade_cost,
                body.train_fraction,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            logger.exception("backtest_failed", tickers=body.tickers)
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    return portfolio



@app.post("/api/stock/fetch")
def stock_fetch(body: StockFetchBody) -> dict[str, Any]:
    try:
        return fetch_ticker_history(body.ticker, years=body.years, provider=body.provider)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/stock/{ticker}/quote")
def stock_quote(ticker: str) -> dict[str, Any]:
    try:
        return get_live_quote(ticker)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/stock/{ticker}/research")
def stock_research(ticker: str, fundamentals: bool = True) -> dict[str, Any]:
    try:
        rows = load_ticker_rows(ticker)
        return build_stock_research(ticker, rows, include_fundamentals=fundamentals)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

import json
def _load_trained_model() -> dict[str, Any]:
    model_path = ROOT / "data" / "trained_model.json"
    if model_path.exists():
        with open(model_path, "r") as f:
            return json.load(f)
    return {}

@app.get("/api/stock/{ticker}/synthesis")
@limiter.limit("30/minute")
def stock_synthesis(request: Request, ticker: str) -> dict[str, Any]:
    with REQUEST_LATENCY.labels(route="/api/stock/synthesis").time():
        try:
            rows = load_ticker_rows(ticker)
            technical_data = build_stock_research(ticker, rows, include_fundamentals=True)
            news_data = fetch_current_events(ticker, limit=5)
            
            model_data = _load_trained_model()
            settings = model_data.get("settings")
            prediction_data = {}
            if settings:
                try:
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
                    prediction_data = {
                        "probability_up": result.get("probability"),
                        "signal": result.get("signal"),
                        "expected_return": result.get("expectedReturn"),
                    }
                except Exception:
                    pass
            
            # Increment LLM call counter
            if not OPENAI_API_KEY:
                LLM_CALLS.labels(outcome="no_api_key").inc()
            
            try:
                thesis = synthesize_research(ticker, news_data, technical_data, prediction_data)
                if thesis.get("executive_summary") and "offline" not in thesis.get("executive_summary", "").lower():
                     LLM_CALLS.labels(outcome="success").inc()
                else:
                     # This handles the case where it returns a fallback dict but didn't actually call OpenAI
                     if not OPENAI_API_KEY:
                         pass # already incremented no_api_key
                     else:
                         LLM_CALLS.labels(outcome="error").inc()
                return thesis
            except Exception as exc:
                LLM_CALLS.labels(outcome="error").inc()
                raise exc

        except Exception as exc:
            logger.exception("synthesis_failed", ticker=ticker)
            raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/stock/{ticker}/insiders")
def stock_insiders(ticker: str) -> dict[str, Any]:
    try:
        return fetch_insider_activity(ticker)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/datasets/{ticker}/meta")
def dataset_meta(ticker: str) -> dict[str, Any]:
    try:
        rows = load_ticker_rows(ticker)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {
        "ticker": ticker.upper(),
        "rows": len(rows),
        "start": rows[0].date,
        "end": rows[-1].date,
        "maxCutoff": max(95, len(rows) - 6),
        "dates": [r.date for r in rows],
    }


@app.post("/api/stock/test")
def stock_test(body: StockTestBody) -> dict[str, Any]:
    if not body.settings:
        raise HTTPException(status_code=400, detail="Train the model first")
    try:
        if body.refresh:
            fetch_ticker_history(body.ticker, years=body.years, provider=body.provider)
        rows = load_ticker_rows(body.ticker)
        catalysts = _catalysts_dict(body.catalysts)

        if body.mode == "latest":
            result = latest_signal_test(
                rows,
                body.ticker.upper(),
                body.horizon,
                body.confidence,
                body.settings,
                catalysts,
                body.dte,
                body.iv,
                body.trade_cost,
                body.train_fraction,
            )
            try:
                result["quote"] = get_live_quote(body.ticker)
            except Exception:
                result["quote"] = None
            result["series"] = rows_to_dicts(rows)
            result["maxCutoff"] = len(rows) - body.horizon - 1
            result["rowCount"] = len(rows)
            result["cutoffIndex"] = len(rows) - 1
        else:
            cutoff = _resolve_cutoff(rows, body)
            result = point_in_time_test(
                rows,
                body.ticker.upper(),
                cutoff,
                body.horizon,
                body.confidence,
                body.settings,
                catalysts,
                body.dte,
                body.iv,
                body.trade_cost,
                body.train_fraction,
            )
            chart_end = min(len(rows), cutoff + body.horizon + 1)
            result["series"] = rows_to_dicts(rows[:chart_end])
            result["maxCutoff"] = len(rows) - body.horizon - 1
            result["rowCount"] = len(rows)
            result["cutoffIndex"] = cutoff
            result["quote"] = None

        result["dataEnd"] = rows[-1].date
        result["dates"] = [r.date for r in rows]

        if body.include_options:
            try:
                from market_predictor.data import load_options_chain

                as_of = result["date"]
                chain = load_options_chain(body.ticker, as_of, mode="live")
                attach_options_to_signal(result, chain, body.horizon, body.confidence)
            except Exception as exc:
                result["options"] = {"available": False, "message": str(exc)}

    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


def main() -> int:
    import uvicorn

    uvicorn.run(app, host=api_host(), port=api_port(), log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
