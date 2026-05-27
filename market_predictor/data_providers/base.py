from __future__ import annotations

from abc import ABC, abstractmethod

from .types import EquityBar, OptionsChain


class DataProvider(ABC):
    name: str

    @abstractmethod
    def fetch_equity_bars(self, ticker: str, start: str, end: str) -> list[EquityBar]:
        raise NotImplementedError

    @abstractmethod
    def fetch_options_chain(self, ticker: str, as_of: str) -> OptionsChain:
        raise NotImplementedError
