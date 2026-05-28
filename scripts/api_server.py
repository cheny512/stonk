from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, Literal

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from market_predictor.config import api_host, api_port
from market_predictor.live_data import (
    fetch_ticker_history,
    get_live_quote,
    index_for_date,
    list_available_providers,
    load_ticker_rows,
)
from market_predictor.live_signals import generate_live_signals
from market_predictor.options_recommend import attach_options_to_signal
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

app = FastAPI(title="stonk API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    if not body.tickers:
        raise HTTPException(status_code=400, detail="Select at least one ticker")
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
    if not body.tickers:
        raise HTTPException(status_code=400, detail="Select at least one ticker")
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
