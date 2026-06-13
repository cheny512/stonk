from __future__ import annotations

from datetime import date, datetime
from sqlalchemy import BigInteger, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text, PrimaryKeyConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

class Base(DeclarativeBase):
    pass

class Ticker(Base):
    __tablename__ = "tickers"
    symbol: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    sector: Mapped[str | None] = mapped_column(String, nullable=True)
    first_seen: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_seen: Mapped[date | None] = mapped_column(Date, nullable=True)

class PriceBar(Base):
    __tablename__ = "price_bars"
    symbol: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[date] = mapped_column(Date, primary_key=True)
    open: Mapped[float] = mapped_column(Float)
    high: Mapped[float] = mapped_column(Float)
    low: Mapped[float] = mapped_column(Float)
    close: Mapped[float] = mapped_column(Float)
    volume: Mapped[int] = mapped_column(BigInteger)

class TrainingRun(Base):
    __tablename__ = "training_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    model_kind: Mapped[str] = mapped_column(String)
    hit_rate: Mapped[float | None] = mapped_column(Float, nullable=True)
    brier: Mapped[float | None] = mapped_column(Float, nullable=True)
    settings_json: Mapped[str] = mapped_column(Text)

class BacktestRun(Base):
    __tablename__ = "backtest_runs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    horizon: Mapped[int] = mapped_column(Integer)
    confidence: Mapped[float] = mapped_column(Float)
    trade_cost: Mapped[float] = mapped_column(Float)
    n_trades: Mapped[int] = mapped_column(Integer)
    total_return: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_drawdown: Mapped[float | None] = mapped_column(Float, nullable=True)

class Trade(Base):
    __tablename__ = "trades"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    backtest_id: Mapped[int] = mapped_column(Integer, ForeignKey("backtest_runs.id"))
    date: Mapped[date] = mapped_column(Date)
    ticker: Mapped[str] = mapped_column(String)
    side: Mapped[str] = mapped_column(String)
    prob_up: Mapped[float] = mapped_column(Float)
    expected_return: Mapped[float] = mapped_column(Float)
    realized: Mapped[float] = mapped_column(Float)
