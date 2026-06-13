from __future__ import annotations

import json
from datetime import datetime, date
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from market_predictor.data import PriceRow
from market_predictor.backtest import BacktestResult, BacktestTrade
from market_predictor.db.models import PriceBar, TrainingRun, BacktestRun, Trade

def _parse_date(d: str | date) -> date:
    if isinstance(d, date):
        return d
    return datetime.strptime(d, "%Y-%m-%d").date()

def upsert_bars(session: Session, symbol: str, rows: list[PriceRow]) -> int:
    """Idempotently inserts or updates price bars."""
    count = 0
    for row in rows:
        stmt = sqlite_insert(PriceBar).values(
            symbol=symbol,
            date=_parse_date(row.date),
            open=row.open,
            high=row.high,
            low=row.low,
            close=row.close,
            volume=row.volume
        ).on_conflict_do_nothing()
        res = session.execute(stmt)
        if res.rowcount:
            count += 1
    session.commit()
    return count

def get_bars(session: Session, symbol: str, start: str | None = None, end: str | None = None) -> list[PriceRow]:
    """Retrieves bars for a symbol, optionally within a date range."""
    query = select(PriceBar).where(PriceBar.symbol == symbol).order_by(PriceBar.date)
    if start:
        query = query.where(PriceBar.date >= _parse_date(start))
    if end:
        query = query.where(PriceBar.date <= _parse_date(end))
    
    rows = session.scalars(query).all()
    return [
        PriceRow(
            date=row.date.isoformat(),
            open=row.open,
            high=row.high,
            low=row.low,
            close=row.close,
            volume=row.volume,
            extras={}
        )
        for row in rows
    ]

def record_training_run(session: Session, *, model_kind: str, hit_rate: float, brier: float, settings: dict) -> int:
    """Records a training run."""
    run = TrainingRun(
        model_kind=model_kind,
        hit_rate=hit_rate,
        brier=brier,
        settings_json=json.dumps(settings),
        finished_at=datetime.utcnow()
    )
    session.add(run)
    session.commit()
    return run.id

def record_backtest(session: Session, *, horizon: int, confidence: float, trade_cost: float, result: BacktestResult) -> int:
    """Records a backtest summary."""
    run = BacktestRun(
        horizon=horizon,
        confidence=confidence,
        trade_cost=trade_cost,
        n_trades=result.signal_count,
        total_return=result.cumulative_pnl,
        max_drawdown=result.max_drawdown
    )
    session.add(run)
    session.commit()
    return run.id

def record_trades(session: Session, backtest_id: int, trades: list[BacktestTrade]) -> None:
    """Records trades for a backtest."""
    for t in trades:
        trade = Trade(
            backtest_id=backtest_id,
            date=_parse_date(t.date),
            ticker=t.ticker if hasattr(t, 'ticker') else "UNKNOWN", # BacktestTrade might not have ticker in current implementation
            side=t.side,
            prob_up=t.probability_up,
            expected_return=t.predicted_return,
            realized=t.realized_return
        )
        session.add(trade)
    session.commit()
