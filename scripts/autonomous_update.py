#!/usr/bin/env python3
"""
Fully Autonomous Model Update Script.
Downloads latest S&P 500 data, retrains multiple engines, 
and selects the champion for live trading.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.universe import list_universe, load_datasets, download_universe
from market_predictor.ui_model import DEFAULT_CATALYSTS
from market_predictor.weight_optimizer import train_best_model

def main() -> int:
    print("Step 1: Downloading latest S&P 500 history...")
    # Update first 50 tickers for a fast but representative training
    # For a full update, remove the limit.
    download_result = download_universe(years=10, limit=50)
    print(f"  Downloaded: {download_result['downloaded']} tickers")

    print("\nStep 2: Identifying ready tickers...")
    universe = list_universe(only_ready=True)
    tickers = [item["ticker"] for item in universe]
    if not tickers:
        print("Error: No ready tickers found.")
        return 1
    
    print(f"  Ready for training: {len(tickers)} tickers")

    print("\nStep 3: Loading datasets and running Champion-Challenger loop...")
    datasets = load_datasets(tickers)
    
    # Configuration
    horizon = 5
    confidence = 0.56
    catalysts = dict(DEFAULT_CATALYSTS)
    
    champion = train_best_model(
        datasets,
        horizon,
        catalysts,
        train_fraction=0.7,
        confidence=confidence
    )
    
    print("\nStep 4: Saving Champion model to data/trained_model.json...")
    output_path = ROOT / "data" / "trained_model.json"
    with open(output_path, "w") as f:
        json.dump(champion, f, indent=2)
    
    print(f"Successfully updated autonomous model!")
    print(f"Champion Method: {champion['method']}")
    print(f"Validation Hit Rate: {champion['validation']['hitRate']:.2%}")
    print(f"Total Training Rows: {champion['totalRows']}")
    
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
