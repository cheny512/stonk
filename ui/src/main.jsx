import React from "react";
import { createRoot } from "react-dom/client";
import { RotateCcw, Upload, Play, Activity, ShieldCheck } from "lucide-react";
import "./styles.css";

const weights = {
  momentum5: 1.45,
  momentum20: 1.1,
  trend: 0.9,
  volumeShock: 0.3,
  volatility: -0.65,
  rsi: -0.55,
  earnings: 0.9,
  guidance: 0.85,
  contract: 0.45,
  sentiment: 0.35,
  ceo: 0.18,
  rates: 0.55,
};

const initialCatalysts = {
  earnings: 0.25,
  guidance: 0.2,
  contract: 0,
  sentiment: 0.1,
  ceo: 0.05,
  rates: -0.15,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pct(value) {
  if (!Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(2)}%`;
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function stdev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-clamp(value, -35, 35)));
}

function returns(rows) {
  const out = [];
  for (let i = 1; i < rows.length; i += 1) out.push(rows[i].close / rows[i - 1].close - 1);
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

function number(value) {
  return Number(String(value ?? "").replaceAll(",", ""));
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 90) throw new Error("Need at least 90 rows of daily prices.");
  const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const dateIdx = headers.indexOf("date");
  const closeIdx = headers.indexOf("adj close") >= 0 ? headers.indexOf("adj close") : headers.indexOf("close");
  const openIdx = headers.indexOf("open");
  const highIdx = headers.indexOf("high");
  const lowIdx = headers.indexOf("low");
  const volumeIdx = headers.indexOf("volume");
  if (dateIdx < 0 || closeIdx < 0) throw new Error("CSV must contain Date and Close or Adj Close.");
  return lines
    .slice(1)
    .map((line) => {
      const cells = splitCsvLine(line);
      const close = number(cells[closeIdx]);
      return {
        date: cells[dateIdx],
        open: openIdx >= 0 ? number(cells[openIdx]) : close,
        high: highIdx >= 0 ? number(cells[highIdx]) : close,
        low: lowIdx >= 0 ? number(cells[lowIdx]) : close,
        close,
        volume: volumeIdx >= 0 ? number(cells[volumeIdx]) : 0,
      };
    })
    .filter((row) => row.date && Number.isFinite(row.close));
}

function generateDemoRows() {
  const rows = [];
  let price = 108;
  let seed = 21;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  for (let i = 0; i < 260; i += 1) {
    const drift = 0.00055 + Math.sin(i / 18) * 0.003;
    const shock = (rand() - 0.5) * 0.03;
    const open = price * (1 + (rand() - 0.5) * 0.01);
    price = Math.max(8, price * (1 + drift + shock));
    const high = Math.max(open, price) * (1 + rand() * 0.015);
    const low = Math.min(open, price) * (1 - rand() * 0.015);
    rows.push({
      date: new Date(2025, 0, i + 1).toISOString().slice(0, 10),
      open,
      high,
      low,
      close: price,
      volume: Math.round(900000 + rand() * 600000 + Math.sin(i / 11) * 180000),
    });
  }
  return rows;
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

function featureAt(rows, index, catalysts) {
  const slice = rows.slice(0, index + 1);
  const close = slice.map((r) => r.close);
  const volume = slice.map((r) => r.volume);
  const daily = returns(slice);
  const latest = rows[index];
  const ret = (days) => (close.length > days ? close.at(-1) / close.at(-1 - days) - 1 : 0);
  const vol20 = stdev(daily.slice(-20)) * Math.sqrt(252);
  const volSlice = volume.slice(-20);
  const volumeShock = stdev(volSlice) ? (volume.at(-1) - mean(volSlice)) / stdev(volSlice) : 0;
  const upDays = daily.slice(-10).filter((v) => v > 0).length / Math.max(1, Math.min(10, daily.length));
  const high20 = Math.max(...slice.slice(-20).map((r) => r.high));
  const low20 = Math.min(...slice.slice(-20).map((r) => r.low));
  const closePosition = high20 === low20 ? 0.5 : (latest.close - low20) / (high20 - low20);
  return {
    momentum5: ret(5),
    momentum20: ret(20),
    trend: upDays + closePosition - 1,
    volumeShock: clamp(volumeShock / 5, -1, 1),
    volatility: vol20,
    rsi: computeRsi(close.slice(-15)) - 0.5,
    ...catalysts,
  };
}

function score(features) {
  return sigmoid(
    Object.entries(weights).reduce((raw, [key, weight]) => raw + (features[key] || 0) * weight, 0),
  );
}

function optionsSetup(bias, edge) {
  if (edge <= 0) return "Long premium looks expensive.";
  if (bias === "Bullish") return "Call spread has the cleaner defined-risk shape.";
  if (bias === "Bearish") return "Put spread has the cleaner defined-risk shape.";
  return "Movement may be underpriced, but direction is not strong.";
}

function analyze({ rows, ticker, horizon, confidence, dte, iv, catalysts }) {
  if (rows.length < 90 + horizon) throw new Error("Need more price rows for this horizon.");
  const examples = [];
  for (let i = 60; i < rows.length - horizon; i += 1) {
    const features = featureAt(rows, i, catalysts);
    const probability = score(features);
    const realized = rows[i + horizon].close / rows[i].close - 1;
    examples.push({ date: rows[i].date, probability, realized });
  }
  const split = Math.floor(examples.length * 0.7);
  const test = examples.slice(split);
  let correct = 0;
  let signalHits = 0;
  let signalCount = 0;
  let pnl = 0;
  test.forEach((item) => {
    const predictedUp = item.probability >= 0.5;
    const realizedUp = item.realized > 0;
    if (predictedUp === realizedUp) correct += 1;
    const isLong = item.probability >= confidence;
    const isShort = item.probability <= 1 - confidence;
    if (isLong || isShort) {
      signalCount += 1;
      if ((isLong && realizedUp) || (isShort && !realizedUp)) signalHits += 1;
      pnl += (isLong ? item.realized : -item.realized) - 0.001;
    }
  });

  const latestFeatures = featureAt(rows, rows.length - 1, catalysts);
  const probabilityUp = score(latestFeatures);
  const recentAbs = mean(returns(rows).slice(-40).map(Math.abs)) * Math.sqrt(horizon);
  const predictedReturn = (probabilityUp - 0.5) * 2 * Math.max(0.01, recentAbs * 1.8);
  const expectedMove = Math.max(Math.abs(predictedReturn), recentAbs);
  const impliedMove = iv * Math.sqrt(dte / 365);
  const movementEdge = expectedMove - impliedMove;
  const bias = probabilityUp >= confidence ? "Bullish" : probabilityUp <= 1 - confidence ? "Bearish" : "Neutral";

  return {
    rows,
    ticker,
    horizon,
    probabilityUp,
    predictedReturn,
    expectedMove,
    impliedMove,
    movementEdge,
    bias,
    setup: optionsSetup(bias, movementEdge),
    testCount: test.length,
    accuracy: correct / test.length,
    hitRate: signalCount ? signalHits / signalCount : 0,
    signalCount,
    avgPnl: signalCount ? pnl / signalCount : 0,
    features: latestFeatures,
  };
}

function Sparkline({ rows }) {
  const width = 900;
  const height = 320;
  const pad = 34;
  const data = rows.slice(-120);
  const closes = data.map((r) => r.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const points = data.map((row, index) => {
    const x = pad + (index / Math.max(1, data.length - 1)) * (width - pad * 2);
    const y = height - pad - ((row.close - min) / Math.max(0.0001, max - min)) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Price path chart">
      {[0, 1, 2, 3].map((line) => {
        const y = pad + ((height - pad * 2) / 3) * line;
        return <line key={line} x1={pad} x2={width - pad} y1={y} y2={y} className="grid-line" />;
      })}
      <polyline points={points} fill="none" className="price-line" />
      <text x={pad} y={22} className="chart-label">{max.toFixed(2)}</text>
      <text x={pad} y={height - 10} className="chart-label">{min.toFixed(2)}</text>
    </svg>
  );
}

function SignalGauge({ probability }) {
  const angle = -90 + probability * 180;
  const color = probability >= 0.56 ? "var(--green)" : probability <= 0.44 ? "var(--red)" : "var(--gold)";
  return (
    <div className="gauge-wrap" role="img" aria-label={`Signal gauge ${pct(probability)}`}>
      <div className="gauge-arc" />
      <div className="gauge-fill" style={{ "--fill": `${probability * 100}%`, "--gauge-color": color }} />
      <div className="needle" style={{ transform: `rotate(${angle}deg)` }} />
      <strong>{pct(probability)}</strong>
      <span>bearish&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;bullish</span>
    </div>
  );
}

function MetricCard({ accent, label, value, note }) {
  return (
    <article className={`metric-card ${accent}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function FactorPressure({ features }) {
  const rows = Object.entries(weights)
    .map(([key, weight]) => ({ key, value: (features[key] || 0) * weight }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 8);
  return (
    <div className="factor-list">
      {rows.map((row) => {
        const width = clamp(Math.abs(row.value) * 90, 4, 100);
        const name = row.key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
        return (
          <div className="factor-row" key={row.key}>
            <span>{name}</span>
            <strong>{row.value >= 0 ? "+" : ""}{row.value.toFixed(3)}</strong>
            <div className={`factor-meter ${row.value < 0 ? "negative" : ""}`}>
              <div style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function App() {
  const [rows, setRows] = React.useState(() => generateDemoRows());
  const [ticker, setTicker] = React.useState("DEMO");
  const [horizon, setHorizon] = React.useState(5);
  const [confidence, setConfidence] = React.useState(0.56);
  const [dte, setDte] = React.useState(21);
  const [iv, setIv] = React.useState(45);
  const [catalysts, setCatalysts] = React.useState(initialCatalysts);
  const [status, setStatus] = React.useState("Demo data loaded");
  const [inputError, setInputError] = React.useState("");

  const analysis = React.useMemo(() => {
    try {
      return {
        result: analyze({
          rows,
          ticker: ticker || "TICKER",
          horizon: clamp(Math.round(horizon), 1, 60),
          confidence: clamp(confidence, 0.51, 0.9),
          dte: clamp(Math.round(dte), 1, 730),
          iv: clamp(iv / 100, 0.01, 3),
          catalysts,
        }),
        error: "",
      };
    } catch (err) {
      return { result: null, error: err.message };
    }
  }, [rows, ticker, horizon, confidence, dte, iv, catalysts]);
  const result = analysis.result;
  const error = inputError || analysis.error;

  const updateCatalyst = (key, value) => {
    setCatalysts((current) => ({ ...current, [key]: Number(value) }));
  };

  const loadFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setRows(parsed);
      setTicker(file.name.replace(/\.csv$/i, "").toUpperCase());
      setStatus(`${parsed.length} rows loaded`);
      setInputError("");
    } catch (err) {
      setInputError(err.message);
      setStatus("CSV error");
    }
  };

  const loadDemo = () => {
    setRows(generateDemoRows());
    setTicker("DEMO");
    setStatus("Demo data loaded");
    setInputError("");
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="control-rail" aria-label="Analysis controls">
          <div className="brand-block">
            <p className="eyebrow">stonk</p>
            <h1>Research Desk</h1>
            <p className="subtle">Directional forecast, movement pricing, and options setup quality.</p>
          </div>

          <label className="control-group">
            Ticker
            <input value={ticker} onChange={(event) => setTicker(event.target.value)} autoComplete="off" />
          </label>

          <div className="control-grid">
            <label className="control-group">
              Horizon
              <input type="number" min="1" max="60" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} />
            </label>
            <label className="control-group">
              Signal
              <input type="number" min="0.51" max="0.9" step="0.01" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} />
            </label>
          </div>

          <div className="control-grid">
            <label className="control-group">
              DTE
              <input type="number" min="1" max="730" value={dte} onChange={(event) => setDte(Number(event.target.value))} />
            </label>
            <label className="control-group">
              IV
              <input type="number" min="1" max="300" step="1" value={iv} onChange={(event) => setIv(Number(event.target.value))} />
            </label>
          </div>

          <label className="control-group file-control">
            Price CSV
            <input type="file" accept=".csv,text/csv" onChange={loadFile} />
            <Upload size={17} aria-hidden="true" />
          </label>

          <div className="factor-panel">
            <div className="panel-heading">
              <h2>Current Catalysts</h2>
              <button type="button" className="icon-button" title="Reset catalysts" aria-label="Reset catalysts" onClick={() => setCatalysts(Object.fromEntries(Object.keys(initialCatalysts).map((key) => [key, 0])))}>
                <RotateCcw size={17} />
              </button>
            </div>
            {Object.entries(catalysts).map(([key, value]) => (
              <label key={key}>
                <span>{key.replace(/^./, (c) => c.toUpperCase())}</span>
                <input type="range" min="-1" max="1" step="0.05" value={value} onChange={(event) => updateCatalyst(key, event.target.value)} />
              </label>
            ))}
          </div>

          <div className="action-row">
            <button type="button" className="primary" onClick={() => setStatus(result ? "Analysis refreshed" : "Check inputs")}>
              <Activity size={18} />
              Analyze
            </button>
            <button type="button" onClick={loadDemo}>
              <Play size={18} />
              Demo
            </button>
          </div>
        </aside>

        <section className="main-stage" aria-label="Prediction dashboard">
          <header className="stage-header">
            <div>
              <p className="eyebrow">Local React model</p>
              <h2>{(ticker || "TICKER").toUpperCase()} forecast</h2>
            </div>
            <div className={`status-pill ${error ? "danger" : ""}`}>{error || status}</div>
          </header>

          {result && (
            <>
              <section className="metric-grid" aria-label="Forecast metrics">
                <MetricCard accent="accent-green" label="Probability Up" value={pct(result.probabilityUp)} note={result.probabilityUp >= 0.5 ? "Bull pressure" : "Bear pressure"} />
                <MetricCard accent="accent-blue" label="Predicted Return" value={pct(result.predictedReturn)} note={`${result.horizon} trading days`} />
                <MetricCard accent="accent-gold" label="Expected Move" value={pct(result.expectedMove)} note={`Implied ${pct(result.impliedMove)}`} />
                <MetricCard accent="accent-red" label="Options Read" value={result.bias} note={result.setup} />
              </section>

              <section className="chart-band">
                <div className="chart-panel price-panel">
                  <div className="panel-heading">
                    <h2>Price Path</h2>
                    <span>Last close {result.rows.at(-1).close.toFixed(2)}</span>
                  </div>
                  <Sparkline rows={result.rows} />
                </div>
                <div className="chart-panel">
                  <div className="panel-heading">
                    <h2>Signal Gauge</h2>
                    <span>{pct(result.probabilityUp)}</span>
                  </div>
                  <SignalGauge probability={result.probabilityUp} />
                </div>
              </section>

              <section className="detail-grid">
                <article className="detail-panel">
                  <div className="panel-heading">
                    <h2>Backtest Gate</h2>
                    <span>{result.testCount} rows</span>
                  </div>
                  <div className="stats-list">
                    <div><span>Accuracy</span><strong>{pct(result.accuracy)}</strong></div>
                    <div><span>Signal hit rate</span><strong>{pct(result.hitRate)}</strong></div>
                    <div><span>Signals</span><strong>{result.signalCount}</strong></div>
                    <div><span>Avg signal PnL proxy</span><strong>{pct(result.avgPnl)}</strong></div>
                  </div>
                </article>

                <article className="detail-panel">
                  <div className="panel-heading">
                    <h2>Factor Pressure</h2>
                    <span>weighted</span>
                  </div>
                  <FactorPressure features={result.features} />
                </article>

                <article className="detail-panel option-panel">
                  <div className="panel-heading">
                    <h2>Trade Discipline</h2>
                    <span>Edge {pct(result.movementEdge)}</span>
                  </div>
                  <p className="discipline-text">
                    {result.setup} Implied move is {pct(result.impliedMove)} versus expected move of {pct(result.expectedMove)}. Keep the trade defined-risk and do not size from model confidence alone.
                  </p>
                  <div className="discipline-badge"><ShieldCheck size={18} /> Research only. No live orders.</div>
                </article>
              </section>
            </>
          )}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
