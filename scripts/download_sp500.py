#!/usr/bin/env python3
"""Download ~10 years of daily OHLCV CSVs for S&P 500 constituents."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.universe import download_universe, get_sp500_tickers, list_universe


def main() -> int:
    parser = argparse.ArgumentParser(description="Download S&P 500 equity CSV history")
    parser.add_argument("--years", type=int, default=10, help="Years of history")
    parser.add_argument("--limit", type=int, default=0, help="Max tickers (0 = all)")
    parser.add_argument("--ticker", action="append", help="Download specific ticker(s) only")
    args = parser.parse_args()

    tickers = args.ticker or get_sp500_tickers()
    limit = args.limit if args.limit > 0 else None
    print(f"Downloading {len(tickers) if not limit else min(limit, len(tickers))} tickers ({args.years}y)...")
    result = download_universe(tickers=tickers, years=args.years, limit=limit)
    ready = [row for row in list_universe(only_ready=True)]
    print(f"Done: {result['downloaded']} ok, {len(result['failed'])} failed, {len(ready)} ready in manifest")
    if result["failed"]:
        sample = list(result["failed"].items())[:5]
        for symbol, err in sample:
            print(f"  {symbol}: {err}")
    return 0 if not result["failed"] or result["downloaded"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
