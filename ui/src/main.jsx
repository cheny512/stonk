import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Database,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  analyze,
  clamp,
  defaultCatalysts,
  defaultSettings,
  generateDemoRows,
  generateLongHistoryRows,
  historicalDataNotes,
  indicatorCatalog,
  parseCsv,
  pct,
  platformTemplates,
} from "./engine";
import "./styles.css";

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function Sparkline({ rows }) {
  const width = 900;
  const height = 320;
  const pad = 34;
  const data = rows.slice(-160);
  const closes = data.map((r) => r.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const points = data
    .map((row, index) => {
      const x = pad + (index / Math.max(1, data.length - 1)) * (width - pad * 2);
      const y = height - pad - ((row.close - min) / Math.max(0.0001, max - min)) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
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

function EquityCurve({ trades }) {
  const width = 900;
  const height = 180;
  const pad = 28;
  let cumulative = 0;
  const curve = trades.map((trade) => {
    cumulative += trade.pnl;
    return cumulative;
  });
  const data = curve.length ? curve : [0];
  const min = Math.min(...data, 0);
  const max = Math.max(...data, 0);
  const points = data
    .map((value, index) => {
      const x = pad + (index / Math.max(1, data.length - 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / Math.max(0.0001, max - min)) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className="mini-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Backtest equity curve">
      <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="grid-line" />
      <polyline points={points} fill="none" className="equity-line" />
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

function IndicatorTable({ features, settings, onToggle, onWeight }) {
  return (
    <div className="indicator-table">
      {indicatorCatalog.map((indicator) => {
        const setting = settings[indicator.key];
        const contribution = (features[indicator.key] || 0) * (setting?.weight || 0);
        return (
          <div className="indicator-row" key={indicator.key}>
            <label className="switch-line">
              <input
                type="checkbox"
                checked={Boolean(setting?.enabled)}
                onChange={(event) => onToggle(indicator.key, event.target.checked)}
              />
              <span>{indicator.label}</span>
            </label>
            <span className="group-tag">{indicator.group}</span>
            <input
              type="number"
              min="-3"
              max="3"
              step="0.05"
              value={setting?.weight ?? 0}
              onChange={(event) => onWeight(indicator.key, Number(event.target.value))}
              aria-label={`${indicator.label} weight`}
            />
            <strong className={contribution >= 0 ? "positive" : "negative"}>
              {contribution >= 0 ? "+" : ""}{fmt(contribution, 3)}
            </strong>
          </div>
        );
      })}
    </div>
  );
}

function FactorPressure({ features, settings }) {
  const rows = indicatorCatalog
    .filter((indicator) => settings[indicator.key]?.enabled)
    .map((indicator) => ({
      ...indicator,
      value: (features[indicator.key] || 0) * settings[indicator.key].weight,
    }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 10);
  return (
    <div className="factor-list">
      {rows.map((row) => {
        const width = clamp(Math.abs(row.value) * 90, 4, 100);
        return (
          <div className="factor-row" key={row.key}>
            <span>{row.label}</span>
            <strong className={row.value >= 0 ? "positive" : "negative"}>
              {row.value >= 0 ? "+" : ""}{row.value.toFixed(3)}
            </strong>
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
  const [tradeCost, setTradeCost] = React.useState(0.1);
  const [trainFraction, setTrainFraction] = React.useState(0.7);
  const [settings, setSettings] = React.useState(() => defaultSettings());
  const [catalysts, setCatalysts] = React.useState(() => defaultCatalysts());
  const [status, setStatus] = React.useState("Demo data loaded");
  const [inputError, setInputError] = React.useState("");

  const analysis = React.useMemo(() => {
    try {
      return {
        result: analyze({
          rows,
          ticker: ticker || "TICKER",
          horizon: clamp(Math.round(horizon), 1, 90),
          confidence: clamp(confidence, 0.51, 0.9),
          dte: clamp(Math.round(dte), 1, 730),
          iv: clamp(iv / 100, 0.01, 3),
          catalysts,
          settings,
          tradeCost: clamp(tradeCost / 100, 0, 0.2),
          trainFraction: clamp(trainFraction, 0.5, 0.9),
        }),
        error: "",
      };
    } catch (err) {
      return { result: null, error: err.message };
    }
  }, [rows, ticker, horizon, confidence, dte, iv, catalysts, settings, tradeCost, trainFraction]);
  const result = analysis.result;
  const error = inputError || analysis.error;

  const updateCatalyst = (key, value) => {
    setCatalysts((current) => ({ ...current, [key]: Number(value) }));
  };

  const updateWeight = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: { ...current[key], weight: clamp(value, -3, 3) },
    }));
  };

  const updateToggle = (key, enabled) => {
    setSettings((current) => ({ ...current, [key]: { ...current[key], enabled } }));
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

  const loadLongHistory = () => {
    setRows(generateLongHistoryRows());
    setTicker("US-MARKET-1871");
    setStatus("Synthetic Shiller-style long history loaded");
    setInputError("");
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="control-rail" aria-label="Analysis controls">
          <div className="brand-block">
            <p className="eyebrow">stonk</p>
            <h1>Research Desk</h1>
            <p className="subtle">20-indicator stock picker, catalyst tester, and options setup gate.</p>
          </div>

          <label className="control-group">
            Ticker / basket
            <input value={ticker} onChange={(event) => setTicker(event.target.value)} autoComplete="off" />
          </label>

          <div className="control-grid">
            <label className="control-group">
              Horizon
              <input type="number" min="1" max="90" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} />
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

          <div className="control-grid">
            <label className="control-group">
              Cost %
              <input type="number" min="0" max="20" step="0.05" value={tradeCost} onChange={(event) => setTradeCost(Number(event.target.value))} />
            </label>
            <label className="control-group">
              Train %
              <input type="number" min="0.5" max="0.9" step="0.05" value={trainFraction} onChange={(event) => setTrainFraction(Number(event.target.value))} />
            </label>
          </div>

          <label className="control-group file-control">
            Historical CSV
            <input type="file" accept=".csv,text/csv" onChange={loadFile} />
            <Upload size={17} aria-hidden="true" />
          </label>

          <div className="factor-panel">
            <div className="panel-heading">
              <h2>Catalyst Overrides</h2>
              <button type="button" className="icon-button" title="Reset catalysts" aria-label="Reset catalysts" onClick={() => setCatalysts(defaultCatalysts())}>
                <RotateCcw size={17} />
              </button>
            </div>
            {Object.entries(catalysts).map(([key, value]) => (
              <label key={key}>
                <span>{key.replace(/([A-Z])/g, " $1")}</span>
                <input type="range" min="-1" max="1" step="0.05" value={value} onChange={(event) => updateCatalyst(key, event.target.value)} />
              </label>
            ))}
          </div>

          <div className="action-row stacked">
            <button type="button" className="primary" onClick={() => setStatus(result ? "Backtest refreshed" : "Check inputs")}>
              <Activity size={18} />
              Backtest
            </button>
            <button type="button" onClick={loadDemo}>
              <Play size={18} />
              Demo
            </button>
            <button type="button" onClick={loadLongHistory}>
              <Database size={18} />
              1871 Mode
            </button>
          </div>
        </aside>

        <section className="main-stage" aria-label="Prediction dashboard">
          <header className="stage-header">
            <div>
              <p className="eyebrow">Configurable stock and options model</p>
              <h2>{(ticker || "TICKER").toUpperCase()} picker</h2>
            </div>
            <div className={`status-pill ${error ? "danger" : ""}`}>{error || status}</div>
          </header>

          {result && (
            <>
              <section className="metric-grid" aria-label="Forecast metrics">
                <MetricCard accent="accent-green" label="Probability Up" value={pct(result.probabilityUp)} note={result.bias} />
                <MetricCard accent="accent-blue" label="Expected Return" value={pct(result.predictedReturn)} note={`${result.horizon} periods`} />
                <MetricCard accent="accent-gold" label="Move Edge" value={pct(result.movementEdge)} note={`Expected ${pct(result.expectedMove)}`} />
                <MetricCard accent="accent-red" label="Options Setup" value={result.bias} note={result.setup} />
              </section>

              <section className="chart-band">
                <div className="chart-panel price-panel">
                  <div className="panel-heading">
                    <h2>Price Path</h2>
                    <span>{result.coverage}</span>
                  </div>
                  <Sparkline rows={result.rows} />
                </div>
                <div className="chart-panel">
                  <div className="panel-heading">
                    <h2>Signal Gauge</h2>
                    <span>Raw {fmt(result.rawScore, 2)}</span>
                  </div>
                  <SignalGauge probability={result.probabilityUp} />
                </div>
              </section>

              <section className="detail-grid wide">
                <article className="detail-panel">
                  <div className="panel-heading">
                    <h2>Backtest Gate</h2>
                    <span>{result.backtest.testCount} test rows</span>
                  </div>
                  <div className="stats-list compact">
                    <div><span>Accuracy</span><strong>{pct(result.backtest.accuracy)}</strong></div>
                    <div><span>Signal hit rate</span><strong>{pct(result.backtest.hitRate)}</strong></div>
                    <div><span>Signals</span><strong>{result.backtest.signalCount}</strong></div>
                    <div><span>Expectancy</span><strong>{pct(result.backtest.expectancy)}</strong></div>
                    <div><span>Profit factor</span><strong>{fmt(result.backtest.profitFactor, 2)}</strong></div>
                    <div><span>Max drawdown</span><strong>{pct(result.backtest.maxDrawdown)}</strong></div>
                  </div>
                  <EquityCurve trades={result.backtest.trades} />
                </article>

                <article className="detail-panel">
                  <div className="panel-heading">
                    <h2>Top Factor Pressure</h2>
                    <span>active weights</span>
                  </div>
                  <FactorPressure features={result.features} settings={settings} />
                </article>
              </section>

              <section className="detail-grid">
                <article className="detail-panel span-two">
                  <div className="panel-heading">
                    <h2><SlidersHorizontal size={17} /> Top 20 Indicators</h2>
                    <span>{indicatorCatalog.filter((item) => settings[item.key]?.enabled).length} active</span>
                  </div>
                  <IndicatorTable features={result.features} settings={settings} onToggle={updateToggle} onWeight={updateWeight} />
                </article>

                <article className="detail-panel option-panel">
                  <div className="panel-heading">
                    <h2>Options Picker</h2>
                    <span>IV {fmt(iv, 0)}% · DTE {dte}</span>
                  </div>
                  <p className="discipline-text">
                    {result.setup} Implied move is {pct(result.impliedMove)} versus expected move of {pct(result.expectedMove)}. Use this as a filter before selecting calls, puts, spreads, or volatility structures.
                  </p>
                  <div className="discipline-badge"><BarChart3 size={18} /> Stock signal first. Options price second.</div>
                </article>
              </section>

              <section className="detail-grid">
                <article className="detail-panel">
                  <div className="panel-heading">
                    <h2>Platform Tools To Borrow</h2>
                    <span>concept map</span>
                  </div>
                  <div className="note-list">
                    {platformTemplates.map((item) => (
                      <div key={item.name}>
                        <strong>{item.name}</strong>
                        <span>{item.text}</span>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="detail-panel span-two">
                  <div className="panel-heading">
                    <h2>Historical Data Reality</h2>
                    <span>1800s support</span>
                  </div>
                  <div className="note-list columns">
                    {historicalDataNotes.map((note) => <div key={note}><span>{note}</span></div>)}
                  </div>
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
