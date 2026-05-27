#!/usr/bin/env python3
"""Verify Massive API connectivity using MASSIVE_API_KEY from .env."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.config import massive_api_base, massive_api_key
from market_predictor.data_providers.polygon import PolygonProvider


def main() -> int:
    key = massive_api_key()
    if not key:
        print("Set MASSIVE_API_KEY in .env (see .env.example)")
        return 1
    print(f"Base URL: {massive_api_base()}")
    client = PolygonProvider()
    trade = client.last_trade("AAPL")
    print(f"AAPL last trade price: {trade.get('p')}")
    bars = client.fetch_equity_bars("AAPL", "2025-01-02", "2025-05-01")
    print(f"AAPL daily bars fetched: {len(bars)} ({bars[0].date} → {bars[-1].date})")
    print("Massive API OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
