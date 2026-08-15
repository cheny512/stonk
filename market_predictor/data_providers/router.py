from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal

from ..config import options_provider
from .base import DataProvider
from .polygon import PolygonProvider
from .thetadata import ThetaDataProvider
from .types import EquityBar, OptionsChain

# Historical chains always use ThetaData. Recent chains use the configured
# options provider; ThetaData v3 is the local-first default.
HISTORICAL_CUTOFF_DAYS = 7


def _parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def provider_name_for_as_of(as_of: str, *, mode: Literal["auto", "training", "live"] = "auto") -> str:
    if mode == "training":
        return "thetadata"
    if mode == "live":
        return options_provider()
    age_days = (date.today() - _parse_date(as_of)).days
    if age_days > HISTORICAL_CUTOFF_DAYS:
        return "thetadata"
    return options_provider()


def provider_for_as_of(as_of: str, *, mode: Literal["auto", "training", "live"] = "auto") -> DataProvider:
    name = provider_name_for_as_of(as_of, mode=mode)
    if name == "thetadata":
        is_live = mode == "live" or (
            mode == "auto" and (date.today() - _parse_date(as_of)).days <= HISTORICAL_CUTOFF_DAYS
        )
        return ThetaDataProvider(live=is_live)
    return PolygonProvider()


def equity_provider_name(end: str, *, mode: Literal["auto", "training", "live"] = "auto") -> str:
    if mode == "training":
        return "thetadata"
    if mode == "live":
        return "massive"
    end_date = _parse_date(end)
    if end_date < date.today() - timedelta(days=HISTORICAL_CUTOFF_DAYS):
        return "thetadata"
    return "massive"


def fetch_equity_bars(
    ticker: str,
    start: str,
    end: str,
    *,
    mode: Literal["auto", "training", "live"] = "auto",
) -> list[EquityBar]:
    """Equity OHLCV: ThetaData for old ranges, Massive for recent end dates."""
    if equity_provider_name(end, mode=mode) == "thetadata":
        return ThetaDataProvider().fetch_equity_bars(ticker, start, end)
    return PolygonProvider().fetch_equity_bars(ticker, start, end)


def fetch_options_chain(
    ticker: str,
    as_of: str,
    *,
    mode: Literal["auto", "training", "live"] = "auto",
) -> OptionsChain:
    return provider_for_as_of(as_of, mode=mode).fetch_options_chain(ticker, as_of)
