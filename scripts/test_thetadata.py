#!/usr/bin/env python3
"""Verify the local Theta Terminal v3 connection without printing credentials."""

from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.config import thetadata_base_url
from market_predictor.data_providers.thetadata import ThetaDataError, ThetaDataProvider


def main() -> int:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=10)
    provider = ThetaDataProvider()
    print(f"Theta Terminal: {thetadata_base_url()}")
    try:
        bars = provider.fetch_equity_bars("AAPL", start.isoformat(), end.isoformat())
    except ThetaDataError as exc:
        print(f"ThetaData v3 unavailable: {exc}")
        return 1
    print(f"ThetaData v3 OK: fetched {len(bars)} AAPL daily bars")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
