from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EquityBar:
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass(frozen=True)
class OptionQuote:
    symbol: str
    underlying: str
    expiration: str
    strike: float
    right: str
    bid: float
    ask: float
    mid: float
    implied_vol: float | None
    delta: float | None
    open_interest: float | None
    volume: float | None


@dataclass(frozen=True)
class OptionsChain:
    underlying: str
    as_of: str
    spot: float | None
    quotes: list[OptionQuote]
    provider: str
