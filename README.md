# stonk

Stock Options Prediction Lab

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
- Provides a React dashboard with:
  - top 20 stock movement indicators
  - enable/disable toggles and custom weights
  - catalyst overrides
  - walk-forward-style train/test split
  - hit rate, expectancy, profit factor, max drawdown, and equity curve
  - options setup read based on stock signal versus implied move

No external Python packages are required.

## Top 20 Indicators

The React UI currently exposes:

1. Earnings surprise
2. Revenue surprise
3. Guidance revision
4. Contract / backlog
5. News / hype sentiment
6. CEO credibility
7. Rates / macro shock
8. Sector relative strength
9. 5D momentum
10. 20D momentum
11. 60D trend
12. 20D SMA gap
13. 50D SMA gap
14. RSI 14
15. MACD histogram
16. 20D realized volatility
17. ATR 14
18. 20D volume shock
19. VWAP distance
20. 20D breakout position

These are configurable because the right weights vary by regime, asset, holding period, and options structure.

## Historical Data Scope

The app can import long historical CSVs, including monthly index-style data.

Important limits:

- U.S. broad-market testing can reach the 1800s with datasets like Robert Shiller's monthly U.S. market data, which starts in 1871.
- Survivorship-aware individual U.S. stock testing generally needs institutional datasets such as CRSP, which starts in 1925.
- Listed equity options data is modern. Do not treat 1800s stock-index tests as options-chain tests.
- VWAP and volume indicators become neutral when imported data has no volume field.

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

Open the React UI:

```bash
cd ui
npm install
npm run dev
```

Then visit:

```text
http://127.0.0.1:5173
```

The UI can run on demo data or an uploaded daily OHLCV CSV.

CLI backtest:


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
