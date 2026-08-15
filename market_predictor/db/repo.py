from __future__ import annotations

import json
import hashlib
import secrets
import uuid
from datetime import UTC, datetime, date
from sqlalchemy import select, delete
from sqlalchemy.orm import Session
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from market_predictor.data import PriceRow
from market_predictor.backtest import BacktestResult, BacktestTrade
from market_predictor.db.models import BacktestRun, PriceBar, Trade, TrainingRun, User, Watchlist, WatchlistItem

MAX_WATCHLIST_ITEMS = 25

def _parse_date(d: str | date) -> date:
    if isinstance(d, date):
        return d
    return datetime.strptime(d, "%Y-%m-%d").date()


def normalize_watchlist_symbols(symbols: list[str]) -> list[str]:
    normalized: list[str] = []
    for value in symbols:
        symbol = "".join(character for character in str(value).strip().upper() if character.isalnum() or character in ".-")[:12]
        if symbol and symbol not in normalized:
            normalized.append(symbol)
        if len(normalized) >= MAX_WATCHLIST_ITEMS:
            break
    return normalized


def _hash_access_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_anonymous_user(session: Session, *, timezone: str = "UTC") -> tuple[User, str]:
    """Create a token-protected device profile and its default saved-stock list."""
    access_token = secrets.token_urlsafe(32)
    user = User(
        public_id=str(uuid.uuid4()),
        access_token_hash=_hash_access_token(access_token),
        timezone=timezone or "UTC",
    )
    session.add(user)
    session.flush()
    session.add(Watchlist(user_id=user.id, name="Saved stocks", slug="saved-stocks"))
    session.commit()
    session.refresh(user)
    return user, access_token


def get_user_by_access_token(session: Session, token: str) -> User | None:
    if not token:
        return None
    return session.scalar(select(User).where(User.access_token_hash == _hash_access_token(token)))


def get_default_watchlist(session: Session, user_id: int) -> Watchlist:
    watchlist = session.scalar(
        select(Watchlist).where(Watchlist.user_id == user_id, Watchlist.slug == "saved-stocks")
    )
    if watchlist is None:
        watchlist = Watchlist(user_id=user_id, name="Saved stocks", slug="saved-stocks")
        session.add(watchlist)
        session.flush()
    return watchlist


def get_watchlist_symbols(session: Session, user_id: int) -> list[str]:
    watchlist = get_default_watchlist(session, user_id)
    return list(
        session.scalars(
            select(WatchlistItem.symbol)
            .where(WatchlistItem.watchlist_id == watchlist.id)
            .order_by(WatchlistItem.position, WatchlistItem.id)
        ).all()
    )


def replace_watchlist_symbols(session: Session, user_id: int, symbols: list[str]) -> list[str]:
    """Replace the default watchlist atomically, preserving the submitted order."""
    normalized = normalize_watchlist_symbols(symbols)
    watchlist = get_default_watchlist(session, user_id)
    session.execute(delete(WatchlistItem).where(WatchlistItem.watchlist_id == watchlist.id))
    for position, symbol in enumerate(normalized):
        session.add(WatchlistItem(watchlist_id=watchlist.id, symbol=symbol, position=position))
    watchlist.updated_at = datetime.now(UTC).replace(tzinfo=None)
    session.commit()
    return normalized

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
