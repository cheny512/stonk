# stonk

Intent is to speed up the process of researching a stock. 
Figuring out what to buy and when to buy is daunting, especially for new stock traders and people who don't have as much experience. 

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
  - multi-stock research universe selection
  - indicator correlation ranking across selected stocks
  - continuously trained weights from historical samples
  - point-in-time single-stock testing
  - walk-forward-style train/test split
  - hit rate, expectancy, profit factor, max drawdown, and equity curve
  - options setup read based on stock signal versus implied move

The core CLI and feature engine run with the Python standard library only. For live/historical market data and the React API bridge, install optional dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

## Data Providers

| Role | Provider | Use |
|------|----------|-----|
| Training / deep history | **ThetaData** | Options chains and equity EOD for old `as_of` dates |
| Live / recent | **Massive.com** | Recent chains, snapshots, and equity aggregates |

Routing is automatic: dates older than 7 days use ThetaData; recent dates use Massive. Override with `mode=training` or `mode=live` on API/CLI calls.

Downloaded files are cached under `data/` (gitignored) as parquet or csv.

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

## Workflow

1. Use **Research** to choose multiple stock/index datasets.
2. Let the app rank the 20 indicators by correlation to future returns.
3. Keep continuous training on, or apply the trained weights and manually edit them.
4. Use **Stock Test** to choose one stock and one historical date.
5. Check predicted direction, predicted move, actual move, and the pre-date backtest.
6. Only after repeated high out-of-sample accuracy should the model be used for real stock selection research.

## External Tool Notes

The Sources view links to current official information for:

- TradingView Strategy Tester
- TradingView Pine/VWAP reference
- TradeZella backtesting
- Tradesyncer journal/risk tools
- FX Replay backtesting
- Alpha Futures risk/evaluation concepts
- Shiller 1871 market data
- CRSP historical stock data

These sites are not all direct data APIs. TradingView, TradeZella, FX Replay, and Tradesyncer are platforms/tools; Shiller and CRSP are the relevant historical data sources. For live stock testing, import licensed/exported OHLCV data or add a market-data API such as Polygon, Tiingo, Nasdaq Data Link, Interactive Brokers, or a broker feed.

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

### One command: API + React UI

```bash
source .venv/bin/activate
pip install -r requirements.txt
cd ui && npm install && npm run dev
```

This starts the Python API on port **8000** and Vite on **5173**. All training and backtests run on the server when you click buttons in the UI.

### Download S&P 500 history (10 years, daily CSV)

From the UI: **Download S&P 500 (10y)** (or CLI):

```bash
python3 scripts/download_sp500.py
```

CSVs are stored under `data/equity/sp500/` (gitignored). Tickers are sourced from the public S&P 500 constituents list and pulled via Yahoo Finance (`yfinance`).

### Workflow

1. **Download S&P 500 (10y)** — fetches real OHLCV CSVs (~500 tickers; first run can take 30+ minutes).
2. Select tickers in the universe list.
3. **Auto-train weights** — jointly learns all 20 indicator weights via logistic regression on a chronological train/validation split (optional coordinate refinement on validation hit rate).
4. **Run portfolio backtest** — walk-forward metrics across selected stocks.
5. **Live stock + options scan** — applies trained weights to the latest bar on each selected ticker and ranks option calls/puts from the live chain (Massive if configured).
6. **Stock Test** tab — test any individual ticker:
   - **Historical test** — slide to a past date and score vs actual forward return
   - **Latest (live)** — refresh from API and score the most recent bar (forward outcome pending)
   - Type any symbol (AAPL, TSLA, SPY, etc.) and click **Load / refresh**

### Live data providers

| Provider | Key required | Best for |
|----------|--------------|----------|
| **Massive.com** (formerly Polygon) | `MASSIVE_API_KEY` | US stocks + options; live quotes and chains ([docs](https://massive.com/docs/rest/stocks/overview)) |
| **yfinance** | None | Any ticker, daily bars; free, delayed (~15 min) |
| **ThetaData** | username/password | Deep historical **options** for training |

With no Massive key, the app uses **yfinance** automatically for load/refresh and quotes.

```bash
cp .env.example .env   # add MASSIVE_API_KEY=your_key
python3 scripts/test_massive.py
```

No demo or synthetic price series are generated in the app.

### Production static UI

```bash
cd ui && npm run build
python3 scripts/serve_ui.py
```

Serves `ui/dist` at `http://127.0.0.1:8765`.

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

1. Wire the Research UI to `fetchEquityBars` / `fetchOptionsChain` in `ui/src/api/client.js`.
2. Store daily model snapshots so you can audit prediction drift.
3. Add options-chain ingestion: bid/ask, IV, delta, open interest, skew.
4. Add event calendars: earnings dates, FOMC, CPI, product launches.
5. Add portfolio risk: max loss, beta exposure, sector concentration, event overlap.
