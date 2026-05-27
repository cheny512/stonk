#!/usr/bin/env python3
"""Train the global model using all ready S&P 500 constituents."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from market_predictor.universe import list_universe, load_datasets
from market_predictor.ui_model import DEFAULT_CATALYSTS
from market_predictor.weight_optimizer import train_autonomous_weights, refine_weights_coordinate_descent

def main() -> int:
    universe = list_universe(only_ready=True)
    tickers = [item["ticker"] for item in universe]
    if not tickers:
        print("No ready tickers found in universe. Run download_sp500.py first.")
        return 1

    print(f"Training on {len(tickers)} tickers...")
    datasets = load_datasets(tickers)
    
    # We can use default parameters or allow customization
    horizon = 5
    train_fraction = 0.7
    confidence = 0.56
    catalysts = dict(DEFAULT_CATALYSTS)
    
    print("Running autonomous weight training...")
    trained = train_autonomous_weights(
        datasets,
        horizon,
        catalysts,
        train_fraction=train_fraction,
        confidence=confidence,
    )
    
    print("Refining weights via coordinate descent...")
    refined = refine_weights_coordinate_descent(
        datasets,
        horizon,
        catalysts,
        trained["settings"],
        train_fraction=train_fraction,
        confidence=confidence,
    )
    
    trained["settings"] = refined["settings"]
    trained["validation"] = refined["validation"]
    trained["method"] = refined["method"]
    
    # Save the trained model settings
    output_path = ROOT / "data" / "trained_model.json"
    with open(output_path, "w") as f:
        json.dump(trained, f, indent=2)
    
    print(f"Model trained successfully! Saved to {output_path}")
    print(f"Validation Hit Rate: {trained['validation']['hitRate']:.2%}")
    print(f"Validation Accuracy: {trained['validation']['accuracy']:.2%}")
    print(f"Signal Count: {trained['validation']['signalCount']}")
    
    print("\nTop 10 Learned Indicators:")
    top_coeffs = sorted(trained.get("coefficients", []), key=lambda x: abs(x["directionWeight"]), reverse=True)
    for i, coeff in enumerate(top_coeffs[:10], 1):
        print(f"{i}. {coeff['label']} ({coeff['key']}): {coeff['directionWeight']:.4f}")
    
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
