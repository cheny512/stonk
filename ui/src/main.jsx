import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Database,
  FlaskConical,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
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
  pointInTimeTest,
  rankIndicators,
  runPortfolioBacktest,
  trainSettingsFromCorrelations,
} from "./engine";
import "./styles.css";

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function makeDemoDatasets() {
  const base = generateDemoRows(620);
  const growth = base.map((row, index) => ({ ...row, close: row.close * (1 + index * 0.00035), high: row.high * (1 + index * 0.00035), low: row.low * (1 + index * 0.00035), open: row.open * (1 + index * 0.00035) }));
  const choppy = base.map((row, index) => ({ ...row, close: row.close * (1 + Math.sin(index / 9) * 0.06), high: row.high * (1 + Math.sin(index / 9) * 0.06), low: row.low * (1 + Math.sin(index / 9) * 0.06), open: row.open * (1 + Math.sin(index / 9) * 0.06) }));
  return [
    { ticker: "DEMO", rows: base, selected: true, kind: "daily demo" },
    { ticker: "DEMO-GROWTH", rows: growth, selected: true, kind: "daily demo" },
    { ticker: "DEMO-CHOP", rows: choppy, selected: true, kind: "daily demo" },
    { ticker: "US-MARKET-1871", rows: generateLongHistoryRows(), selected: false, kind: "monthly index" },
  ];
}

function Sparkline({ rows }) {
  const width = 900;
  const height = 280;
  const pad = 32;
  const data = rows.slice(-180);
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
      <text x={pad} y={height - 9} className="chart-label">{min.toFixed(2)}</text>
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
    <div className="gauge-wrap compact-gauge" role="img" aria-label={`Signal gauge ${pct(probability)}`}>
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

function DatasetPicker({ datasets, onToggle }) {
  return (
    <div className="dataset-list">
      {datasets.map((dataset) => (
        <label className="dataset-row" key={dataset.ticker}>
          <input type="checkbox" checked={dataset.selected} onChange={(event) => onToggle(dataset.ticker, event.target.checked)} />
          <span>
            <strong>{dataset.ticker}</strong>
            <small>{dataset.rows.length} rows · {dataset.kind}</small>
          </span>
        </label>
      ))}
    </div>
  );
}

function RankingTable({ rankings, settings, onToggle, onWeight }) {
  return (
    <div className="indicator-table">
      {rankings.map((indicator, index) => {
        const setting = settings[indicator.key];
        return (
          <div className="indicator-row ranked" key={indicator.key}>
            <label className="switch-line">
              <input
                type="checkbox"
                checked={Boolean(setting?.enabled)}
                onChange={(event) => onToggle(indicator.key, event.target.checked)}
              />
              <span>{index + 1}. {indicator.label}</span>
            </label>
            <span className="group-tag">{indicator.group}</span>
            <strong className={indicator.correlation >= 0 ? "positive" : "negative"}>{indicator.correlation >= 0 ? "+" : ""}{fmt(indicator.correlation, 3)}</strong>
            <input
              type="number"
              min="-3"
              max="3"
              step="0.05"
              value={setting?.weight ?? 0}
              onChange={(event) => onWeight(indicator.key, Number(event.target.value))}
              aria-label={`${indicator.label} weight`}
            />
          </div>
        );
      })}
    </div>
  );
}

function SourcePanel() {
  return (
    <section className="detail-grid">
      <article className="detail-panel span-two">
        <div className="panel-heading">
          <h2>Live Source Map</h2>
          <span>official pages checked today</span>
        </div>
        <div className="note-list columns">
          {platformTemplates.map((item) => (
            <a href={item.href} target="_blank" rel="noreferrer" key={item.name}>
              <strong>{item.name}</strong>
              <span>{item.text}</span>
            </a>
          ))}
        </div>
      </article>
      <article className="detail-panel">
        <div className="panel-heading">
          <h2>Data Reality</h2>
          <span>important</span>
        </div>
        <div className="note-list">
          {historicalDataNotes.map((note) => <div key={note}><span>{note}</span></div>)}
        </div>
      </article>
    </section>
  );
}

function App() {
  const [view, setView] = React.useState("research");
  const [datasets, setDatasets] = React.useState(() => makeDemoDatasets());
  const [activeTicker, setActiveTicker] = React.useState("DEMO");
  const [horizon, setHorizon] = React.useState(5);
  const [confidence, setConfidence] = React.useState(0.56);
  const [dte, setDte] = React.useState(21);
  const [iv, setIv] = React.useState(45);
  const [tradeCost, setTradeCost] = React.useState(0.1);
  const [trainFraction, setTrainFraction] = React.useState(0.7);
  const [settings, setSettings] = React.useState(() => defaultSettings());
  const [catalysts, setCatalysts] = React.useState(() => defaultCatalysts());
  const [autoTrain, setAutoTrain] = React.useState(true);
  const [status, setStatus] = React.useState("Demo research universe loaded");
  const [inputError, setInputError] = React.useState("");
  const activeDataset = datasets.find((dataset) => dataset.ticker === activeTicker) || datasets[0];
  const [cutoffIndex, setCutoffIndex] = React.useState(360);

  const selectedDatasets = React.useMemo(() => datasets.filter((dataset) => dataset.selected), [datasets]);

  const trained = React.useMemo(() => {
    try {
      return trainSettingsFromCorrelations({ datasets: selectedDatasets, horizon: clamp(Math.round(horizon), 1, 90), catalysts });
    } catch (error) {
      return { settings: defaultSettings(), rankings: indicatorCatalog.map((row) => ({ ...row, correlation: 0, strength: 0, sampleCount: 0 })), totalRows: 0, error: error.message };
    }
  }, [selectedDatasets, horizon, catalysts]);
  const modelSettings = autoTrain ? trained.settings : settings;

  const research = React.useMemo(() => {
    try {
      const portfolio = runPortfolioBacktest({
        datasets: selectedDatasets,
        horizon: clamp(Math.round(horizon), 1, 90),
        confidence: clamp(confidence, 0.51, 0.9),
        settings: modelSettings,
        catalysts,
        tradeCost: clamp(tradeCost / 100, 0, 0.2),
        trainFraction: clamp(trainFraction, 0.5, 0.9),
      });
      const ranked = rankIndicators({ datasets: selectedDatasets, horizon: clamp(Math.round(horizon), 1, 90), catalysts });
      return { portfolio, rankings: ranked.rankings, totalRows: ranked.totalRows, error: "" };
    } catch (error) {
      return { portfolio: null, rankings: [], totalRows: 0, error: error.message };
    }
  }, [selectedDatasets, horizon, confidence, modelSettings, catalysts, tradeCost, trainFraction]);

  const maxCutoff = Math.max(95, (activeDataset?.rows.length || 120) - Math.round(horizon) - 1);
  const safeCutoff = clamp(cutoffIndex, 95 + Math.round(horizon), maxCutoff);

  const pointTest = React.useMemo(() => {
    try {
      if (!activeDataset) throw new Error("Choose or import a stock dataset first.");
      return {
        result: pointInTimeTest({
          rows: activeDataset.rows,
          ticker: activeDataset.ticker,
          cutoffIndex: safeCutoff,
          horizon: clamp(Math.round(horizon), 1, 90),
          confidence: clamp(confidence, 0.51, 0.9),
          settings: modelSettings,
          catalysts,
          dte: clamp(Math.round(dte), 1, 730),
          iv: clamp(iv / 100, 0.01, 3),
          tradeCost: clamp(tradeCost / 100, 0, 0.2),
          trainFraction: clamp(trainFraction, 0.5, 0.9),
        }),
        error: "",
      };
    } catch (error) {
      return { result: null, error: error.message };
    }
  }, [activeDataset, safeCutoff, horizon, confidence, modelSettings, catalysts, dte, iv, tradeCost, trainFraction]);

  const error = inputError || research.error || pointTest.error || trained.error || "";

  const toggleDataset = (ticker, selected) => {
    setDatasets((current) => current.map((dataset) => dataset.ticker === ticker ? { ...dataset, selected } : dataset));
  };

  const updateCatalyst = (key, value) => {
    setCatalysts((current) => ({ ...current, [key]: Number(value) }));
  };

  const updateWeight = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: { ...current[key], weight: clamp(value, -3, 3) },
    }));
    setAutoTrain(false);
  };

  const updateToggle = (key, enabled) => {
    setSettings((current) => ({ ...current, [key]: { ...current[key], enabled } }));
    setAutoTrain(false);
  };

  const applyTraining = () => {
    setSettings(trained.settings);
    setAutoTrain(false);
    setStatus(`Applied trained weights from ${trained.totalRows} historical samples`);
  };

  const loadFiles = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    try {
      const imported = [];
      for (const file of files) {
        const text = await file.text();
        imported.push({
          ticker: file.name.replace(/\\.csv$/i, "").toUpperCase(),
          rows: parseCsv(text),
          selected: true,
          kind: "imported CSV",
        });
      }
      setDatasets((current) => [...current, ...imported]);
      setActiveTicker(imported[0].ticker);
      setStatus(`${imported.length} dataset${imported.length === 1 ? "" : "s"} imported`);
      setInputError("");
    } catch (err) {
      setInputError(err.message);
      setStatus("CSV error");
    }
  };

  const resetDemo = () => {
    const demo = makeDemoDatasets();
    setDatasets(demo);
    setActiveTicker("DEMO");
    setCutoffIndex(360);
    setStatus("Demo research universe loaded");
    setInputError("");
  };

  const selectedCount = selectedDatasets.length;
  const stockResult = pointTest.result;
  const portfolio = research.portfolio;

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="control-rail" aria-label="Analysis controls">
          <div className="brand-block">
            <p className="eyebrow">stonk</p>
            <h1>Research Desk</h1>
            <p className="subtle">Train indicators on many stocks, then test one stock at one point in time.</p>
          </div>

          <div className="view-tabs" role="tablist" aria-label="Model views">
            <button type="button" className={view === "research" ? "selected" : ""} onClick={() => setView("research")}>Research</button>
            <button type="button" className={view === "stock" ? "selected" : ""} onClick={() => setView("stock")}>Stock Test</button>
            <button type="button" className={view === "sources" ? "selected" : ""} onClick={() => setView("sources")}>Sources</button>
          </div>

          <label className="control-group file-control">
            Import stock CSVs
            <input type="file" accept=".csv,text/csv" multiple onChange={loadFiles} />
            <Upload size={17} aria-hidden="true" />
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

          <label className="switch-line auto-switch">
            <input type="checkbox" checked={autoTrain} onChange={(event) => setAutoTrain(event.target.checked)} />
            <span>Continuously train weights from selected datasets</span>
          </label>

          <div className="factor-panel">
            <div className="panel-heading">
              <h2>Research Universe</h2>
              <span>{selectedCount} selected</span>
            </div>
            <DatasetPicker datasets={datasets} onToggle={toggleDataset} />
          </div>

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
            <button type="button" className="primary" onClick={applyTraining}>
              <FlaskConical size={18} />
              Apply Trained Weights
            </button>
            <button type="button" onClick={resetDemo}>
              <Play size={18} />
              Reset Demo
            </button>
            <button type="button" onClick={() => setStatus(portfolio ? "Backtest refreshed" : "Check inputs")}>
              <Activity size={18} />
              Refresh
            </button>
          </div>
        </aside>

        <section className="main-stage" aria-label="Prediction dashboard">
          <header className="stage-header">
            <div>
              <p className="eyebrow">{view === "research" ? "Multi-stock indicator training" : view === "stock" ? "Point-in-time stock test" : "Data connectors and platform notes"}</p>
              <h2>{view === "research" ? "Research Desk" : view === "stock" ? `${activeTicker} test` : "Live Information Sources"}</h2>
            </div>
            <div className={`status-pill ${error ? "danger" : ""}`}>{error || status}</div>
          </header>

          {view === "research" && portfolio && (
            <>
              <section className="metric-grid" aria-label="Research metrics">
                <MetricCard accent="accent-green" label="Cross-stock accuracy" value={pct(portfolio.accuracy)} note={`${portfolio.testCount} test rows`} />
                <MetricCard accent="accent-blue" label="Signal hit rate" value={pct(portfolio.hitRate)} note={`${portfolio.signalCount} trades`} />
                <MetricCard accent="accent-gold" label="Expectancy" value={pct(portfolio.expectancy)} note="per signaled trade" />
                <MetricCard accent="accent-red" label="Max drawdown" value={pct(portfolio.maxDrawdown)} note="worst tested dataset" />
              </section>

              <section className="detail-grid wide">
                <article className="detail-panel">
                  <div className="panel-heading">
                    <h2>Indicator Correlation Ranking</h2>
                    <span>{research.totalRows} historical samples</span>
                  </div>
                  <RankingTable rankings={research.rankings} settings={modelSettings} onToggle={updateToggle} onWeight={updateWeight} />
                </article>
                <article className="detail-panel">
                  <div className="panel-heading">
                    <h2>Dataset Results</h2>
                    <span>walk-forward split</span>
                  </div>
                  <div className="dataset-results">
                    {portfolio.results.map((item) => (
                      <div key={item.ticker}>
                        <strong>{item.ticker}</strong>
                        <span>{item.coverage}</span>
                        <small>Accuracy {pct(item.backtest.accuracy)} · Hit {pct(item.backtest.hitRate)} · Expectancy {pct(item.backtest.expectancy)}</small>
                      </div>
                    ))}
                  </div>
                </article>
              </section>

              <SourcePanel />
            </>
          )}

          {view === "stock" && stockResult && (
            <>
              <section className="stock-toolbar">
                <label className="control-group">
                  Stock dataset
                  <select value={activeTicker} onChange={(event) => { setActiveTicker(event.target.value); setCutoffIndex(360); }}>
                    {datasets.map((dataset) => <option key={dataset.ticker} value={dataset.ticker}>{dataset.ticker}</option>)}
                  </select>
                </label>
                <label className="control-group">
                  Test date
                  <input type="range" min={95 + Math.round(horizon)} max={maxCutoff} value={safeCutoff} onChange={(event) => setCutoffIndex(Number(event.target.value))} />
                </label>
                <div className="date-readout">
                  <strong>{stockResult.date}</strong>
                  <span>testing through {stockResult.futureDate}</span>
                </div>
              </section>

              <section className="metric-grid" aria-label="Stock test metrics">
                <MetricCard accent="accent-green" label="Predicted direction" value={stockResult.bias} note={`${pct(stockResult.probabilityUp)} probability up`} />
                <MetricCard accent="accent-blue" label="Predicted move" value={pct(stockResult.predictedReturn)} note={`Expected ${pct(stockResult.expectedMove)}`} />
                <MetricCard accent="accent-gold" label="Actual move" value={pct(stockResult.realizedReturn)} note={stockResult.directionCorrect ? "Direction passed" : "Direction missed"} />
                <MetricCard accent="accent-red" label="Options edge" value={pct(stockResult.movementEdge)} note={`Implied ${pct(stockResult.impliedMove)}`} />
              </section>

              <section className="chart-band">
                <div className="chart-panel price-panel">
                  <div className="panel-heading">
                    <h2>Historical Window</h2>
                    <span>{stockResult.coverage}</span>
                  </div>
                  <Sparkline rows={activeDataset.rows.slice(0, safeCutoff + Math.round(horizon) + 1)} />
                </div>
                <div className="chart-panel">
                  <div className="panel-heading">
                    <h2>Point Signal</h2>
                    <span>Raw {fmt(stockResult.rawScore, 2)}</span>
                  </div>
                  <SignalGauge probability={stockResult.probabilityUp} />
                </div>
              </section>

              <section className="detail-grid wide">
                <article className="detail-panel">
                  <div className="panel-heading">
                    <h2>Pre-date Backtest</h2>
                    <span>{stockResult.backtest.testCount} rows before test</span>
                  </div>
                  <div className="stats-list compact">
                    <div><span>Accuracy</span><strong>{pct(stockResult.backtest.accuracy)}</strong></div>
                    <div><span>Signal hit rate</span><strong>{pct(stockResult.backtest.hitRate)}</strong></div>
                    <div><span>Signals</span><strong>{stockResult.backtest.signalCount}</strong></div>
                    <div><span>Expectancy</span><strong>{pct(stockResult.backtest.expectancy)}</strong></div>
                    <div><span>Profit factor</span><strong>{fmt(stockResult.backtest.profitFactor, 2)}</strong></div>
                    <div><span>Max drawdown</span><strong>{pct(stockResult.backtest.maxDrawdown)}</strong></div>
                  </div>
                  <EquityCurve trades={stockResult.backtest.trades} />
                </article>

                <article className="detail-panel">
                  <div className="panel-heading">
                    <h2>Decision Gate</h2>
                    <span>{stockResult.directionCorrect ? "passed" : "failed"}</span>
                  </div>
                  <p className="discipline-text">
                    At {stockResult.date}, the trained model predicted {stockResult.bias.toLowerCase()} with {pct(stockResult.probabilityUp)} probability up. The actual move by {stockResult.futureDate} was {pct(stockResult.realizedReturn)}.
                  </p>
                  <div className="discipline-badge"><BarChart3 size={18} /> Backtest before live stock picking.</div>
                </article>
              </section>
            </>
          )}

          {view === "sources" && <SourcePanel />}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
