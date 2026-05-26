# Stock Options Prediction Lab

A local research tool for estimating short-term stock direction, expected move, and options-relevant setup quality.

This is **not** a trading oracle and it is not financial advice. The point is to force every idea through data, walk-forward testing, and risk checks before it gets anywhere near an options order.

## What It Does

- Reads daily OHLCV CSV files.
- Builds features that map to real stock movers:
  - earnings/guidance/event scores, if provided
  - momentum, trend, volatility, volume shock
  - valuation/expectation proxies via price behavior
  - market/benchmark beta, if provided
- Trains pure-Python models:
  - direction classifier
  - next-period return estimator
- Runs a chronological backtest.
- Scores options setups using:
  - predicted direction
  - predicted/realized expected move
  - implied move from IV and days to expiration
  - confidence threshold

No external Python packages are required.

## CSV Format

Price CSV needs at least:

```csv
Date,Open,High,Low,Close,Volume
2025-01-02,100,103,99,102,1200000
```

`Adj Close` is also accepted and will be preferred if present.

Optional event CSV:

```csv
Date,earnings_surprise,revenue_surprise,guidance_score,contract_score,sentiment_score,ceo_confidence,rate_shock,sector_momentum
2026-05-01,0.08,0.03,0.7,0.0,0.4,0.2,-0.1,0.6
```

Use scores from `-1.0` to `1.0` when the input is qualitative. Example: a major contract relative to market cap might be `contract_score=0.8`; vague CEO optimism might be `ceo_confidence=0.1`.

## Run

Backtest:

```bash
python3 -m market_predictor.cli backtest --prices path/to/AAPL.csv --ticker AAPL --horizon 5
```

Predict and score an options setup:

```bash
python3 -m market_predictor.cli predict \
  --prices path/to/AAPL.csv \
  --ticker AAPL \
  --horizon 5 \
  --days-to-expiry 14 \
  --implied-vol 0.32
```

With event factors and a benchmark:

```bash
python3 -m market_predictor.cli predict \
  --prices path/to/NVDA.csv \
  --benchmark path/to/SPY.csv \
  --events path/to/NVDA_events.csv \
  --ticker NVDA \
  --horizon 5 \
  --days-to-expiry 21 \
  --implied-vol 0.55
```

JSON output:

```bash
python3 -m market_predictor.cli predict --prices path/to/MSFT.csv --json
```

## How To Use It For Options

The tool intentionally separates:

- **direction**: probability stock is up over the horizon
- **magnitude**: expected move percent
- **price of movement**: implied move from option IV
- **quality gate**: whether the historical backtest supports the signal

Basic interpretation:

- Bullish probability high + expected move above implied move: consider defined-risk bullish structures.
- Bearish probability high + expected move above implied move: consider defined-risk bearish structures.
- Direction unclear + expected move above implied move: volatility may be underpriced.
- Expected move below implied move: options may be expensive, especially for long premium.

The software does not place trades. Add broker integration only after paper trading and out-of-sample validation.

## Recommended Next Improvements

1. Add a real data feed: Polygon, Tiingo, Alpha Vantage, Tradier, Interactive Brokers, or yfinance.
2. Store daily model snapshots so you can audit prediction drift.
3. Add options-chain ingestion: bid/ask, IV, delta, open interest, skew.
4. Add event calendars: earnings dates, FOMC, CPI, product launches.
5. Add portfolio risk: max loss, beta exposure, sector concentration, event overlap.

