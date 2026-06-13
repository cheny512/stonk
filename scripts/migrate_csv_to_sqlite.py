#!/usr/bin/env python3
"""Idempotently migrates existing ticker CSVs to SQLite."""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.data import load_price_csv
from market_predictor.db.engine import get_engine, get_session_factory
from market_predictor.db.repo import upsert_bars
from market_predictor.universe import sp500_dir, custom_dir

def migrate() -> int:
    engine = get_engine()
    session_factory = get_session_factory(engine)
    
    csv_dirs = [sp500_dir(), custom_dir()]
    total_tickers = 0
    total_rows = 0
    
    print(f"Starting migration to {engine.url}...")
    
    with session_factory() as session:
        for csv_dir in csv_dirs:
            if not csv_dir.exists():
                continue
            
            for csv_path in csv_dir.glob("*.csv"):
                ticker = csv_path.stem.upper()
                try:
                    rows = load_price_csv(csv_path)
                    if not rows:
                        continue
                    
                    inserted = upsert_bars(session, ticker, rows)
                    total_tickers += 1
                    total_rows += inserted
                    if inserted > 0:
                        print(f"  {ticker}: inserted {inserted} rows")
                    else:
                        print(f"  {ticker}: up to date")
                except Exception as e:
                    print(f"  {ticker}: failed - {e}")
    
    print(f"Migration complete. Processed {total_tickers} tickers, inserted {total_rows} new rows.")
    return 0

if __name__ == "__main__":
    raise SystemExit(migrate())
