export const indicatorCatalog = [
  { key: "earningsSurprise", label: "Earnings surprise", group: "Catalyst", weight: 1.25, source: "Earnings reports" },
  { key: "revenueSurprise", label: "Revenue surprise", group: "Catalyst", weight: 0.75, source: "Earnings reports" },
  { key: "guidanceRevision", label: "Guidance revision", group: "Catalyst", weight: 1.1, source: "TradingView events" },
  { key: "contractBacklog", label: "Contract / backlog", group: "Catalyst", weight: 0.65, source: "Company news" },
  { key: "newsSentiment", label: "News / hype sentiment", group: "Sentiment", weight: 0.45, source: "Journal tags" },
  { key: "ceoCredibility", label: "CEO credibility", group: "Sentiment", weight: 0.22, source: "Management read" },
  { key: "macroRates", label: "Rates / macro shock", group: "Macro", weight: 0.72, source: "FOMC / CPI" },
  { key: "sectorRelativeStrength", label: "Sector relative strength", group: "Market", weight: 0.86, source: "Relative strength" },
  { key: "momentum5", label: "5D momentum", group: "Price", weight: 1.05, source: "TradingView" },
  { key: "momentum20", label: "20D momentum", group: "Price", weight: 1.18, source: "TradingView" },
  { key: "trend60", label: "60D trend", group: "Price", weight: 0.88, source: "Trend filter" },
  { key: "sma20Gap", label: "20D SMA gap", group: "Price", weight: 0.72, source: "TradingView" },
  { key: "sma50Gap", label: "50D SMA gap", group: "Price", weight: 0.64, source: "TradingView" },
  { key: "rsi14", label: "RSI 14", group: "Momentum", weight: -0.42, source: "TradingView" },
  { key: "macdHistogram", label: "MACD histogram", group: "Momentum", weight: 0.58, source: "TradingView" },
  { key: "realizedVol20", label: "20D realized volatility", group: "Risk", weight: -0.55, source: "Risk model" },
  { key: "atr14", label: "ATR 14", group: "Risk", weight: -0.36, source: "TradingView" },
  { key: "volumeShock20", label: "20D volume shock", group: "Volume", weight: 0.34, source: "Tape read" },
  { key: "vwapDistance", label: "VWAP distance", group: "Volume", weight: -0.46, source: "VWAP" },
  { key: "breakoutPosition", label: "20D breakout position", group: "Price", weight: 0.7, source: "Replay / breakout" },
];

export const platformTemplates = [
  {
    name: "TradingView Strategy Tester",
    text: "Indicator toggles, signal threshold, trade log, drawdown, and expectancy.",
  },
  {
    name: "VWAP / Anchored VWAP",
    text: "Compares price against rolling volume-weighted value; neutral when volume is unavailable.",
  },
  {
    name: "TradeZella / TraderSync journal",
    text: "Tracks setup type, win rate, expectancy, profit factor, max drawdown, and mistake-proof risk notes.",
  },
  {
    name: "FX Replay",
    text: "Replay-style scenario testing: change catalysts and immediately inspect how the historical signal would behave.",
  },
  {
    name: "Alpha Futures style",
    text: "Focuses on trend, volatility, volume impulse, and clean defined-risk execution.",
  },
];

export const historicalDataNotes = [
  "U.S. broad-market backtests can reach January 1871 with Robert Shiller's monthly market dataset.",
  "Survivorship-aware individual U.S. stock testing generally starts with CRSP data from 1925.",
  "Listed U.S. equity options data is modern; do not assume option-chain backtests exist in the 1800s.",
  "Before 1925, use index/regime testing; after 1925, use equities; after listed options data is available, test options structures.",
];

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function pct(value) {
  if (!Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(2)}%`;
}

export function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function stdev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1));
}

export function sigmoid(value) {
  return 1 / (1 + Math.exp(-clamp(value, -35, 35)));
}

export function returns(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i += 1) {
    out.push(rows[i - 1].close ? rows[i].close / rows[i - 1].close - 1 : 0);
  }
  return out;
}

function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") quoted = !quoted;
    else if (ch === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.map((v) => v.trim());
}

function number(value, fallback = 0) {
  const parsed = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function findHeader(headers, names) {
  return names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 90) throw new Error("Need at least 90 rows. Use daily OHLCV or monthly long-history data.");
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const dateIdx = findHeader(headers, ["date", "month", "time"]);
  const closeIdx = findHeader(headers, ["adj close", "close", "price", "sp500", "s&p composite", "index"]);
  const openIdx = findHeader(headers, ["open"]);
  const highIdx = findHeader(headers, ["high"]);
  const lowIdx = findHeader(headers, ["low"]);
  const volumeIdx = findHeader(headers, ["volume", "vol"]);
  const earningsIdx = findHeader(headers, ["earnings", "eps"]);
  const dividendIdx = findHeader(headers, ["dividend", "dividends"]);
  const cpiIdx = findHeader(headers, ["cpi", "inflation"]);
  const rateIdx = findHeader(headers, ["rate", "interest rate", "yield", "gs10"]);
  if (dateIdx < 0 || closeIdx < 0) throw new Error("CSV must contain Date and Close/Price.");
  return lines
    .slice(1)
    .map((line) => {
      const cells = splitCsvLine(line);
      const close = number(cells[closeIdx], NaN);
      return {
        date: cells[dateIdx],
        open: openIdx >= 0 ? number(cells[openIdx], close) : close,
        high: highIdx >= 0 ? number(cells[highIdx], close) : close,
        low: lowIdx >= 0 ? number(cells[lowIdx], close) : close,
        close,
        volume: volumeIdx >= 0 ? number(cells[volumeIdx], 0) : 0,
        earnings: earningsIdx >= 0 ? number(cells[earningsIdx], 0) : 0,
        dividend: dividendIdx >= 0 ? number(cells[dividendIdx], 0) : 0,
        cpi: cpiIdx >= 0 ? number(cells[cpiIdx], 0) : 0,
        rate: rateIdx >= 0 ? number(cells[rateIdx], 0) : 0,
      };
    })
    .filter((row) => row.date && Number.isFinite(row.close) && row.close > 0)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function generateDemoRows(length = 520) {
  const rows = [];
  let price = 108;
  let seed = 21;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < length; i += 1) {
    const drift = 0.00055 + Math.sin(i / 35) * 0.0018 + (i > 260 ? 0.00018 : 0);
    const shock = (rand() - 0.5) * 0.028;
    const open = price * (1 + (rand() - 0.5) * 0.01);
    price = Math.max(8, price * (1 + drift + shock));
    const high = Math.max(open, price) * (1 + rand() * 0.015);
    const low = Math.min(open, price) * (1 - rand() * 0.015);
    rows.push({
      date: new Date(2024, 0, i + 1).toISOString().slice(0, 10),
      open,
      high,
      low,
      close: price,
      volume: Math.round(900000 + rand() * 700000 + Math.sin(i / 11) * 180000),
      earnings: i % 63 === 0 ? (rand() - 0.45) * 0.3 : 0,
      dividend: 0,
      cpi: 0,
      rate: 0,
    });
  }
  return rows;
}

export function generateLongHistoryRows() {
  const rows = [];
  let price = 4.4;
  let seed = 1871;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let year = 1871; year <= 2026; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const regime = year < 1914 ? 0.003 : year < 1946 ? 0.001 : year < 1982 ? 0.004 : 0.006;
      const cycle = Math.sin((year - 1871) / 7) * 0.012;
      const shock = (rand() - 0.5) * (year < 1925 ? 0.06 : 0.045);
      price = Math.max(1, price * (1 + regime + cycle + shock));
      rows.push({
        date: `${year}-${String(month + 1).padStart(2, "0")}-01`,
        open: price,
        high: price,
        low: price,
        close: price,
        volume: 0,
        earnings: 0,
        dividend: 0,
        cpi: 0,
        rate: 0,
      });
    }
  }
  return rows;
}

function ema(values, period) {
  if (!values.length) return 0;
  const alpha = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i += 1) value = alpha * values[i] + (1 - alpha) * value;
  return value;
}

function computeRsi(closes) {
  if (closes.length < 2) return 0.5;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }
  if (losses === 0) return 1;
  const rs = gains / losses;
  return 1 - 1 / (1 + rs);
}

function atr(rows) {
  if (rows.length < 2) return 0;
  const values = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const prev = rows[i - 1];
    values.push(Math.max(row.high - row.low, Math.abs(row.high - prev.close), Math.abs(row.low - prev.close)) / row.close);
  }
  return mean(values);
}

function rollingVwap(rows) {
  const vol = rows.reduce((sum, row) => sum + row.volume, 0);
  if (!vol) return rows.at(-1)?.close || 0;
  return rows.reduce((sum, row) => sum + ((row.high + row.low + row.close) / 3) * row.volume, 0) / vol;
}

export function featureAt(rows, index, catalystValues) {
  const slice = rows.slice(0, index + 1);
  const close = slice.map((r) => r.close);
  const volume = slice.map((r) => r.volume);
  const daily = returns(slice);
  const latest = rows[index];
  const ret = (days) => (close.length > days ? close.at(-1) / close.at(-1 - days) - 1 : 0);
  const vol20 = stdev(daily.slice(-20)) * Math.sqrt(252);
  const volSlice = volume.slice(-20);
  const volumeShock = stdev(volSlice) ? (volume.at(-1) - mean(volSlice)) / stdev(volSlice) : 0;
  const high20 = Math.max(...slice.slice(-20).map((r) => r.high));
  const low20 = Math.min(...slice.slice(-20).map((r) => r.low));
  const closePosition = high20 === low20 ? 0.5 : (latest.close - low20) / (high20 - low20);
  const sma20 = mean(close.slice(-20));
  const sma50 = mean(close.slice(-50));
  const sma60 = mean(close.slice(-60));
  const macd = ema(close.slice(-80), 12) - ema(close.slice(-80), 26);
  const signal = ema([...daily.slice(-80), macd], 9);
  const vwap = rollingVwap(slice.slice(-20));
  const previous = rows[Math.max(0, index - 1)];
  const earningsMomentum = latest.earnings && previous.earnings ? (latest.earnings - previous.earnings) / Math.abs(previous.earnings) : 0;

  return {
    earningsSurprise: clamp(catalystValues.earningsSurprise + earningsMomentum, -1, 1),
    revenueSurprise: catalystValues.revenueSurprise,
    guidanceRevision: catalystValues.guidanceRevision,
    contractBacklog: catalystValues.contractBacklog,
    newsSentiment: catalystValues.newsSentiment,
    ceoCredibility: catalystValues.ceoCredibility,
    macroRates: clamp(catalystValues.macroRates + (latest.rate ? -latest.rate / 100 : 0), -1, 1),
    sectorRelativeStrength: catalystValues.sectorRelativeStrength,
    momentum5: clamp(ret(5) * 8, -1, 1),
    momentum20: clamp(ret(20) * 5, -1, 1),
    trend60: clamp((latest.close / Math.max(0.0001, sma60) - 1) * 4, -1, 1),
    sma20Gap: clamp((latest.close / Math.max(0.0001, sma20) - 1) * 8, -1, 1),
    sma50Gap: clamp((latest.close / Math.max(0.0001, sma50) - 1) * 5, -1, 1),
    rsi14: computeRsi(close.slice(-15)) - 0.5,
    macdHistogram: clamp(macd - signal, -1, 1),
    realizedVol20: clamp(vol20, 0, 1),
    atr14: clamp(atr(slice.slice(-15)) * 10, 0, 1),
    volumeShock20: clamp(volumeShock / 5, -1, 1),
    vwapDistance: clamp((latest.close / Math.max(0.0001, vwap) - 1) * 8, -1, 1),
    breakoutPosition: closePosition - 0.5,
  };
}

export function defaultSettings() {
  return Object.fromEntries(indicatorCatalog.map((item) => [item.key, { enabled: true, weight: item.weight }]));
}

export function defaultCatalysts() {
  return {
    earningsSurprise: 0.15,
    revenueSurprise: 0.05,
    guidanceRevision: 0.15,
    contractBacklog: 0,
    newsSentiment: 0.1,
    ceoCredibility: 0.05,
    macroRates: -0.1,
    sectorRelativeStrength: 0.1,
  };
}

export function score(features, settings) {
  let active = 0;
  let totalWeight = 0;
  indicatorCatalog.forEach((indicator) => {
    const setting = settings[indicator.key];
    if (!setting?.enabled) return;
    active += (features[indicator.key] || 0) * setting.weight;
    totalWeight += Math.abs(setting.weight);
  });
  const normalized = totalWeight ? (active / totalWeight) * 5 : 0;
  return {
    probability: sigmoid(normalized),
    raw: normalized,
  };
}

export function runBacktest({ rows, horizon, confidence, settings, catalysts, tradeCost, trainFraction }) {
  if (rows.length < 90 + horizon) throw new Error("Need more price rows for this horizon.");
  const examples = [];
  for (let i = 70; i < rows.length - horizon; i += 1) {
    const features = featureAt(rows, i, catalysts);
    const { probability, raw } = score(features, settings);
    const realized = rows[i + horizon].close / rows[i].close - 1;
    examples.push({ date: rows[i].date, probability, raw, realized, close: rows[i].close });
  }
  const split = Math.floor(examples.length * trainFraction);
  const test = examples.slice(split);
  let correct = 0;
  let signalHits = 0;
  let signalCount = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const trades = [];
  test.forEach((item) => {
    const predictedUp = item.probability >= 0.5;
    const realizedUp = item.realized > 0;
    if (predictedUp === realizedUp) correct += 1;
    const isLong = item.probability >= confidence;
    const isShort = item.probability <= 1 - confidence;
    if (!isLong && !isShort) return;
    const side = isLong ? "long" : "short";
    const pnl = (isLong ? item.realized : -item.realized) - tradeCost;
    signalCount += 1;
    if ((isLong && realizedUp) || (isShort && !realizedUp)) signalHits += 1;
    if (pnl >= 0) grossWin += pnl;
    else grossLoss += Math.abs(pnl);
    cumulative += pnl;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
    trades.push({ ...item, side, pnl });
  });
  return {
    examples,
    test,
    trades,
    testCount: test.length,
    accuracy: test.length ? correct / test.length : 0,
    hitRate: signalCount ? signalHits / signalCount : 0,
    signalCount,
    avgPnl: signalCount ? cumulative / signalCount : 0,
    expectancy: signalCount ? cumulative / signalCount : 0,
    cumulative,
    maxDrawdown,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin ? 99 : 0,
  };
}

export function analyze({ rows, ticker, horizon, confidence, dte, iv, catalysts, settings, tradeCost, trainFraction }) {
  const backtest = runBacktest({ rows, horizon, confidence, settings, catalysts, tradeCost, trainFraction });
  const latestFeatures = featureAt(rows, rows.length - 1, catalysts);
  const latestScore = score(latestFeatures, settings);
  const recentAbs = mean(returns(rows).slice(-40).map(Math.abs)) * Math.sqrt(horizon);
  const predictedReturn = (latestScore.probability - 0.5) * 2 * Math.max(0.01, recentAbs * 1.8);
  const expectedMove = Math.max(Math.abs(predictedReturn), recentAbs);
  const impliedMove = iv * Math.sqrt(dte / 365);
  const movementEdge = expectedMove - impliedMove;
  const bias = latestScore.probability >= confidence ? "Bullish" : latestScore.probability <= 1 - confidence ? "Bearish" : "Neutral";
  return {
    rows,
    ticker,
    horizon,
    probabilityUp: latestScore.probability,
    rawScore: latestScore.raw,
    predictedReturn,
    expectedMove,
    impliedMove,
    movementEdge,
    bias,
    setup: optionsSetup(bias, movementEdge, backtest),
    features: latestFeatures,
    backtest,
    coverage: coverageLabel(rows),
  };
}

function optionsSetup(bias, edge, backtest) {
  if (backtest.signalCount < 20) return "Not enough historical signals for options sizing.";
  if (edge <= 0) return "Long premium looks expensive.";
  if (bias === "Bullish") return "Call spread or risk-defined call structure.";
  if (bias === "Bearish") return "Put spread or risk-defined put structure.";
  return "Movement may be underpriced, but direction is not strong.";
}

function coverageLabel(rows) {
  const first = rows[0]?.date || "--";
  const last = rows.at(-1)?.date || "--";
  const hasVolume = rows.some((row) => row.volume > 0);
  return `${first} to ${last}${hasVolume ? "" : " · no volume/VWAP history"}`;
}

