import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  BarChart3,
  Database,
  Download,
  FlaskConical,
  SlidersHorizontal,
} from "lucide-react";
import {
  downloadUniverse,
  fetchDatasetMeta,
  fetchHealth,
  fetchIndicators,
  fetchProviders,
  fetchLiveSignals,
  fetchStock,
  fetchUniverse,
  runPortfolioBacktest,
  runStockTest,
  trainResearch,
} from "./api/client";
import { clamp, defaultCatalysts, pct } from "./engine";
import "./styles.css";

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(digits);
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
  const curve = (trades || []).map((trade) => {
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

function DatasetPicker({ datasets, onToggle, onSelectAll }) {
  return (
    <div className="dataset-list">
      <div className="dataset-actions">
        <button type="button" onClick={() => onSelectAll(true)}>Select all ready</button>
        <button type="button" onClick={() => onSelectAll(false)}>Clear</button>
      </div>
      {datasets.map((dataset) => (
        <label className={`dataset-row ${dataset.ready ? "" : "disabled"}`} key={dataset.ticker}>
          <input
            type="checkbox"
            checked={dataset.selected}
            disabled={!dataset.ready}
            onChange={(event) => onToggle(dataset.ticker, event.target.checked)}
          />
          <span>
            <strong>{dataset.ticker}</strong>
            <small>
              {dataset.ready
                ? `${dataset.rows} rows · ${dataset.start} → ${dataset.end}`
                : dataset.error || "Not downloaded"}
            </small>
          </span>
        </label>
      ))}
    </div>
  );
}

function OptionsContracts({ options }) {
  if (!options?.available) {
    return <p className="discipline-text">{options?.message || "No options data."}</p>;
  }
  return (
    <div className="options-panel">
      <p className="discipline-text">
        {options.side?.toUpperCase()} bias · exp {options.targetExpiration} ({options.targetDte} DTE) · IV{" "}
        {options.medianIv != null ? `${(options.medianIv * 100).toFixed(1)}%` : "—"} · {options.setup?.setup}
      </p>
      <div className="options-table">
        <div className="options-header">
          <span>Contract</span>
          <span>Strike</span>
          <span>Mid</span>
          <span>IV</span>
          <span>Δ</span>
          <span>OI</span>
        </div>
        {(options.contracts || []).map((c) => (
          <div className="options-row" key={`${c.symbol}-${c.strike}`}>
            <span>{c.type}</span>
            <span>{fmt(c.strike, 2)}</span>
            <span>{fmt(c.mid, 2)}</span>
            <span>{c.impliedVol != null ? pct(c.impliedVol) : "—"}</span>
            <span>{c.delta != null ? fmt(c.delta, 2) : "—"}</span>
            <span>{c.openInterest != null ? Math.round(c.openInterest) : "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveSignalsTable({ payload }) {
  if (!payload?.signals?.length) return null;
  return (
    <div className="dataset-results signals-grid">
      {payload.signals.map((s) => (
        <div key={s.ticker} className={`signal-card ${s.bias?.toLowerCase()}`}>
          <div className="signal-header">
            <strong>{s.ticker}</strong>
            <div className="header-meta">
              {s.movementEdge > 0 && <span className="edge-badge">High Edge</span>}
              {s.quote && <span className="price-label">${fmt(s.quote.price, 2)}</span>}
              <span className={`bias-tag ${s.bias?.toLowerCase()}`}>{s.bias}</span>
            </div>
          </div>
          <div className="signal-metrics">
            <div>
              <span>Prob Up</span>
              <strong>{pct(s.probabilityUp)}</strong>
            </div>
            <div>
              <span>Edge</span>
              <strong className={s.movementEdge > 0 ? "positive" : ""}>{pct(s.movementEdge)}</strong>
            </div>
            <div>
              <span>Expected</span>
              <strong>{pct(s.expectedMove)}</strong>
            </div>
          </div>
          {s.options?.available && s.options.contracts?.length > 0 && (
            <div className="top-option">
              <div className="option-label">Top {s.options.side} recommendation:</div>
              <div className="option-contract">
                <strong>{s.options.contracts[0].strike} {s.options.contracts[0].type.toUpperCase()}</strong>
                <span>${fmt(s.options.contracts[0].mid, 2)}</span>
                <small>DTE {s.options.contracts[0].dte}</small>
              </div>
            </div>
          )}
          {!s.options?.available && <div className="no-options">{s.options?.message || "No options data"}</div>}
        </div>
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
            <strong className={indicator.correlation >= 0 ? "positive" : "negative"} title="Learned weight">
              {indicator.learnedWeight != null ? fmt(indicator.learnedWeight, 2) : `${indicator.correlation >= 0 ? "+" : ""}${fmt(indicator.correlation, 3)}`}
            </strong>
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

function App() {
  const [view, setView] = React.useState("research");
  const [backendOnline, setBackendOnline] = React.useState(false);
  const [datasets, setDatasets] = React.useState([]);
  const [activeTicker, setActiveTicker] = React.useState("");
  const [horizon, setHorizon] = React.useState(5);
  const [confidence, setConfidence] = React.useState(0.56);
  const [dte, setDte] = React.useState(21);
  const [iv, setIv] = React.useState(45);
  const [tradeCost, setTradeCost] = React.useState(0.1);
  const [trainFraction, setTrainFraction] = React.useState(0.7);
  const [modelType, setModelType] = React.useState("logistic");
  const [settings, setSettings] = React.useState({});
  const [rankings, setRankings] = React.useState([]);
  const [trainSamples, setTrainSamples] = React.useState(0);
  const [trainValidation, setTrainValidation] = React.useState(null);
  const [trainMethod, setTrainMethod] = React.useState("");
  const [liveSignals, setLiveSignals] = React.useState(null);
  const [portfolio, setPortfolio] = React.useState(null);
  const [stockResult, setStockResult] = React.useState(null);
  const [cutoffIndex, setCutoffIndex] = React.useState(360);
  const [maxCutoff, setMaxCutoff] = React.useState(400);
  const [dateLabels, setDateLabels] = React.useState([]);
  const [tickerInput, setTickerInput] = React.useState("");
  const [testMode, setTestMode] = React.useState("historical");
  const [refreshBeforeTest, setRefreshBeforeTest] = React.useState(true);
  const [providers, setProviders] = React.useState(null);
  const [catalysts, setCatalysts] = React.useState(() => defaultCatalysts());
  const [status, setStatus] = React.useState("Connect to the Python API to begin.");
  const [inputError, setInputError] = React.useState("");
  const [busy, setBusy] = React.useState("");

  const selectedTickers = React.useMemo(
    () => datasets.filter((d) => d.selected && d.ready).map((d) => d.ticker),
    [datasets],
  );

  const refreshUniverse = React.useCallback(async () => {
    const data = await fetchUniverse(false);
    setDatasets((current) => {
      const selected = new Set(current.filter((d) => d.selected).map((d) => d.ticker));
      return data.tickers.map((item) => ({
        ...item,
        selected: selected.has(item.ticker) || item.ready,
        kind: "S&P 500 CSV",
      }));
    });
    setStatus(`${data.ready} of ${data.count} S&P 500 tickers ready (10y CSV)`);
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        await fetchHealth();
        setBackendOnline(true);
        const meta = await fetchIndicators();
        if (meta.defaultCatalysts) setCatalysts(meta.defaultCatalysts);
        setProviders(await fetchProviders());
        await refreshUniverse();
      } catch (err) {
        setBackendOnline(false);
        setInputError(err.message);
        setStatus("Start the API: npm run dev (from ui/) or python3 scripts/api_server.py");
      }
    })();
  }, [refreshUniverse]);

  const runTrain = async () => {
    if (!selectedTickers.length) {
      setInputError("Select at least one downloaded ticker.");
      return;
    }
    setBusy("train");
    setInputError("");
    try {
      const trained = await trainResearch({
        tickers: selectedTickers,
        horizon: clamp(Math.round(horizon), 1, 90),
        catalysts,
        method: "autonomous",
        modelType,
        refine: modelType === "logistic",
        trainFraction: clamp(trainFraction, 0.5, 0.9),
        confidence: clamp(confidence, 0.51, 0.9),
      });
      setSettings(trained.settings);
      setRankings(trained.rankings);
      setTrainSamples(trained.totalRows);
      setTrainValidation(trained.validation || null);
      setTrainMethod(trained.method || "autonomous");
      const valNote = trained.validation
        ? ` · val hit ${pct(trained.validation.hitRate)} · val acc ${pct(trained.validation.accuracy)}`
        : "";
      setStatus(
        `Autonomous training on ${trained.totalRows} samples (${trained.enabledIndicators ?? "?"} indicators active)${valNote}`,
      );
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const runBacktest = async () => {
    if (!selectedTickers.length) {
      setInputError("Select at least one ticker.");
      return;
    }
    if (!Object.keys(settings).length) {
      setInputError("Train the model first.");
      return;
    }
    setBusy("backtest");
    setInputError("");
    try {
      const result = await runPortfolioBacktest({
        tickers: selectedTickers,
        horizon: clamp(Math.round(horizon), 1, 90),
        confidence: clamp(confidence, 0.51, 0.9),
        settings,
        catalysts,
        tradeCost: clamp(tradeCost / 100, 0, 0.2),
        trainFraction: clamp(trainFraction, 0.5, 0.9),
      });
      setPortfolio(result);
      setStatus(`Walk-forward backtest on ${selectedTickers.length} stocks`);
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const runStockTestAction = async (ticker, { cutoff, mode } = {}) => {
    if (!ticker || !Object.keys(settings).length) {
      setInputError("Train the model on Research first.");
      return;
    }
    const useMode = mode || testMode;
    setBusy("stock");
    setInputError("");
    try {
      const result = await runStockTest({
        ticker,
        mode: useMode,
        cutoffIndex: useMode === "historical" ? cutoff ?? cutoffIndex : undefined,
        refresh: refreshBeforeTest,
        years: 10,
        provider: "auto",
        horizon: clamp(Math.round(horizon), 1, 90),
        confidence: clamp(confidence, 0.51, 0.9),
        settings,
        catalysts,
        dte: clamp(Math.round(dte), 1, 730),
        iv: clamp(iv / 100, 0.01, 3),
        tradeCost: clamp(tradeCost / 100, 0, 0.2),
        trainFraction: clamp(trainFraction, 0.5, 0.9),
      });
      setStockResult(result);
      setMaxCutoff(result.maxCutoff ?? maxCutoff);
      if (result.dates) setDateLabels(result.dates);
      if (result.cutoffIndex != null) setCutoffIndex(result.cutoffIndex);
      setStatus(
        useMode === "latest"
          ? `Latest signal for ${ticker} as of ${result.date}`
          : `Historical test for ${ticker} at ${result.date}`,
      );
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const loadTicker = async (symbol) => {
    const ticker = (symbol || tickerInput).trim().toUpperCase();
    if (!ticker) return;
    setBusy("fetch");
    setInputError("");
    try {
      const fetched = await fetchStock({ ticker, years: 10, provider: "auto" });
      setActiveTicker(ticker);
      setTickerInput(ticker);
      const meta = await fetchDatasetMeta(ticker);
      setDateLabels(meta.dates || []);
      const safe = Math.max(95 + Math.round(horizon), meta.maxCutoff - 1);
      setCutoffIndex(safe);
      setMaxCutoff(meta.maxCutoff);
      await refreshUniverse();
      setStatus(`Loaded ${ticker} via ${fetched.provider} (${fetched.start} → ${fetched.end})`);
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const runLive = async () => {
    if (!selectedTickers.length || !Object.keys(settings).length) {
      setInputError("Train first and select tickers.");
      return;
    }
    setBusy("live");
    setInputError("");
    try {
      const payload = await fetchLiveSignals({
        tickers: selectedTickers,
        horizon: clamp(Math.round(horizon), 1, 90),
        confidence: clamp(confidence, 0.51, 0.9),
        settings,
        catalysts,
        dte: clamp(Math.round(dte), 1, 730),
        iv: clamp(iv / 100, 0.01, 3),
        tradeCost: clamp(tradeCost / 100, 0, 0.2),
        trainFraction: clamp(trainFraction, 0.5, 0.9),
        refresh: true,
        includeOptions: true,
      });
      setLiveSignals(payload);
      setStatus(`Live scan: ${payload.bullish} bullish, ${payload.bearish} bearish, ${payload.neutral} neutral`);
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const loadTrainedModel = async () => {
    setBusy("load");
    setInputError("");
    try {
      const trained = await fetchTrainedModel();
      setSettings(trained.settings);
      setRankings(trained.rankings);
      setTrainSamples(trained.totalRows);
      setTrainValidation(trained.validation || null);
      setTrainMethod(trained.method || "autonomous");
      setStatus(`Loaded global model trained on ${trained.totalRows} samples`);
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const handleDownload = async () => {
    setBusy("download");
    setInputError("");
    setStatus("Downloading 10 years of S&P 500 daily CSVs (this can take a while)…");
    try {
      const result = await downloadUniverse({ years: 10 });
      await refreshUniverse();
      setStatus(`Downloaded ${result.downloaded} tickers; ${result.readyCount} ready`);
      if (result.failed && Object.keys(result.failed).length) {
        setInputError(`${Object.keys(result.failed).length} tickers failed (see API log)`);
      }
    } catch (err) {
      setInputError(err.message);
      setStatus("Download failed");
    } finally {
      setBusy("");
    }
  };

  const toggleDataset = (ticker, selected) => {
    setDatasets((current) => current.map((d) => (d.ticker === ticker ? { ...d, selected } : d)));
  };

  const selectAllReady = (on) => {
    setDatasets((current) => current.map((d) => ({ ...d, selected: on ? d.ready : false })));
  };

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

  const onActiveTickerChange = async (ticker) => {
    setActiveTicker(ticker);
    setTickerInput(ticker);
    try {
      const meta = await fetchDatasetMeta(ticker);
      setDateLabels(meta.dates || []);
      const safe = Math.max(95 + Math.round(horizon), meta.maxCutoff - 1);
      setCutoffIndex(safe);
      setMaxCutoff(meta.maxCutoff);
    } catch (err) {
      setInputError(err.message);
    }
  };

  const testDateLabel = dateLabels[cutoffIndex] || stockResult?.date || "—";

  const error = inputError;
  const readyCount = datasets.filter((d) => d.ready).length;

  return (
    <main className="app-shell">
      <section className="workspace">
        <aside className="control-rail" aria-label="Analysis controls">
          <div className="brand-block">
            <p className="eyebrow">stonk</p>
            <h1>Research Desk</h1>
            <p className="subtle">Real S&P 500 CSV data only. Train and backtest via the Python API.</p>
          </div>

          <div className={`status-pill ${backendOnline ? "" : "danger"}`}>
            {backendOnline ? "API connected" : "API offline"}
          </div>

          <div className="view-tabs" role="tablist" aria-label="Model views">
            <button type="button" className={view === "research" ? "selected" : ""} onClick={() => setView("research")}>
              Research
            </button>
            <button type="button" className={view === "stock" ? "selected" : ""} onClick={() => setView("stock")}>
              Stock Test
            </button>
          </div>

          <div className="control-grid">
            <label className="control-group">
              Horizon
              <input type="number" min="1" max="90" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))} />
            </label>
            <label className="control-group">
              Signal
              <input type="number" min="0.51" max="0.9" step="0.01" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
            </label>
          </div>

          <div className="control-grid">
            <label className="control-group">
              DTE
              <input type="number" min="1" max="730" value={dte} onChange={(e) => setDte(Number(e.target.value))} />
            </label>
            <label className="control-group">
              IV %
              <input type="number" min="1" max="300" step="1" value={iv} onChange={(e) => setIv(Number(e.target.value))} />
            </label>
          </div>

          <div className="control-grid">
            <label className="control-group">
              Cost %
              <input type="number" min="0" max="20" step="0.05" value={tradeCost} onChange={(e) => setTradeCost(Number(e.target.value))} />
            </label>
            <label className="control-group">
              Train %
              <input type="number" min="0.5" max="0.9" step="0.05" value={trainFraction} onChange={(e) => setTrainFraction(Number(e.target.value))} />
            </label>
          </div>

          <div className="control-grid">
            <label className="control-group">
              Model Engine
              <select value={modelType} onChange={(e) => setModelType(e.target.value)}>
                <option value="logistic">Logistic (Interpretable)</option>
                <option value="xgboost">XGBoost (Short-term)</option>
                <option value="svm">SVM (Options Gate)</option>
              </select>
            </label>
          </div>

          <div className="factor-panel">
            <div className="panel-heading">
              <h2>S&P 500 universe</h2>
              <span>{readyCount} ready</span>
            </div>
            <DatasetPicker datasets={datasets} onToggle={toggleDataset} onSelectAll={selectAllReady} />
          </div>

          <div className="factor-panel">
            <div className="panel-heading">
              <h2>Catalyst overrides</h2>
            </div>
            {Object.entries(catalysts).map(([key, value]) => (
              <label key={key}>
                <span>{key.replace(/([A-Z])/g, " $1")}</span>
                <input type="range" min="-1" max="1" step="0.05" value={value} onChange={(e) => updateCatalyst(key, e.target.value)} />
              </label>
            ))}
          </div>

          <div className="action-row stacked">
            <button type="button" className="primary" onClick={handleDownload} disabled={!!busy || !backendOnline}>
              <Download size={18} />
              {busy === "download" ? "Downloading…" : "Download S&P 500 (10y)"}
            </button>
            <button type="button" onClick={runTrain} disabled={!!busy || !backendOnline}>
              <FlaskConical size={18} />
              {busy === "train" ? "Training…" : "Auto-train weights"}
            </button>
            <button type="button" onClick={loadTrainedModel} disabled={!!busy || !backendOnline}>
              <Activity size={18} />
              {busy === "load" ? "Loading…" : "Load global model"}
            </button>
            <button type="button" onClick={runLive} disabled={!!busy || !backendOnline || !Object.keys(settings).length}>
              <SlidersHorizontal size={18} />
              {busy === "live" ? "Scanning…" : "Live stock + options scan"}
            </button>
            <button type="button" onClick={runBacktest} disabled={!!busy || !backendOnline}>
              <Activity size={18} />
              {busy === "backtest" ? "Running…" : "Run portfolio backtest"}
            </button>
            <button type="button" onClick={refreshUniverse} disabled={!!busy || !backendOnline}>
              <Database size={18} />
              Refresh universe
            </button>
          </div>
        </aside>

        <section className="main-stage" aria-label="Prediction dashboard">
          <header className="stage-header">
            <div>
              <p className="eyebrow">{view === "research" ? "Trained on real CSV history" : "Point-in-time stock test"}</p>
              <h2>{view === "research" ? "Research Desk" : `${activeTicker || "—"} test`}</h2>
            </div>
            <div className={`status-pill ${error ? "danger" : ""}`}>{error || status}</div>
          </header>

          {view === "research" && (
            <>
              {!portfolio && !rankings.length && (
                <p className="discipline-text">
                  Download CSVs, select tickers, then <strong>Auto-train weights</strong> (all indicators optimized together),{" "}
                  <strong>Run portfolio backtest</strong>, and <strong>Live stock + options scan</strong>.
                </p>
              )}

              {portfolio && (
                <section className="metric-grid" aria-label="Research metrics">
                  <MetricCard accent="accent-green" label="Cross-stock accuracy" value={pct(portfolio.accuracy)} note={`${portfolio.testCount} test rows`} />
                  <MetricCard accent="accent-blue" label="Signal hit rate" value={pct(portfolio.hitRate)} note={`${portfolio.signalCount} trades`} />
                  <MetricCard accent="accent-gold" label="Expectancy" value={pct(portfolio.expectancy)} note="per signaled trade" />
                  <MetricCard accent="accent-red" label="Max drawdown" value={pct(portfolio.maxDrawdown)} note="worst tested dataset" />
                </section>
              )}

              {trainValidation && (
                <section className="metric-grid" aria-label="Training validation">
                  <MetricCard accent="accent-green" label="Val accuracy" value={pct(trainValidation.accuracy)} note={trainMethod} />
                  <MetricCard accent="accent-blue" label="Val signal hit rate" value={pct(trainValidation.hitRate)} note={`${trainValidation.signalCount} signals`} />
                  <MetricCard accent="accent-gold" label="Val Brier" value={fmt(trainValidation.brier, 4)} note="lower is better" />
                  <MetricCard accent="accent-red" label="Train samples" value={String(trainSamples)} note="chronological split" />
                </section>
              )}

              {liveSignals && (
                <article className="detail-panel span-two">
                  <div className="panel-heading">
                    <h2>Live scan (stocks + options)</h2>
                    <span>{liveSignals.count} tickers</span>
                  </div>
                  <LiveSignalsTable payload={liveSignals} />
                </article>
              )}

              {rankings.length > 0 && (
                <section className="detail-grid wide">
                  <article className="detail-panel">
                    <div className="panel-heading">
                      <h2>Learned indicator weights</h2>
                      <span>{trainSamples} samples · jointly optimized</span>
                    </div>
                    <RankingTable rankings={rankings} settings={settings} onToggle={updateToggle} onWeight={updateWeight} />
                  </article>
                  {portfolio && (
                    <article className="detail-panel">
                      <div className="panel-heading">
                        <h2>Dataset results</h2>
                        <span>walk-forward split</span>
                      </div>
                      <div className="dataset-results">
                        {portfolio.results.map((item) => (
                          <div key={item.ticker}>
                            <strong>{item.ticker}</strong>
                            <span>{item.coverage}</span>
                            <small>
                              Accuracy {pct(item.backtest.accuracy)} · Hit {pct(item.backtest.hitRate)} · Expectancy{" "}
                              {pct(item.backtest.expectancy)}
                            </small>
                          </div>
                        ))}
                      </div>
                    </article>
                  )}
                </section>
              )}
            </>
          )}

          {view === "stock" && (
            <>
              {providers && (
                <p className="discipline-text">
                  Live data: <strong>{providers.default_equity}</strong>
                  {providers.massive?.configured ? " (Massive live)" : " (add MASSIVE_API_KEY in .env for real-time)"}
                  {" · "}any symbol via yfinance fallback.
                </p>
              )}

              <section className="stock-toolbar">
                <label className="control-group">
                  Ticker (any symbol)
                  <input
                    type="text"
                    value={tickerInput}
                    placeholder="e.g. AAPL, TSLA, SPY"
                    onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
                  />
                </label>
                <button type="button" disabled={!!busy || !backendOnline} onClick={() => loadTicker()}>
                  {busy === "fetch" ? "Loading…" : "Load / refresh"}
                </button>
                <label className="control-group">
                  Or pick loaded
                  <select value={activeTicker} onChange={(e) => onActiveTickerChange(e.target.value)}>
                    <option value="">Select…</option>
                    {datasets
                      .filter((d) => d.ready)
                      .map((d) => (
                        <option key={d.ticker} value={d.ticker}>
                          {d.ticker}
                        </option>
                      ))}
                  </select>
                </label>
              </section>

              <section className="stock-toolbar">
                <div className="view-tabs compact-tabs">
                  <button type="button" className={testMode === "historical" ? "selected" : ""} onClick={() => setTestMode("historical")}>
                    Historical test
                  </button>
                  <button type="button" className={testMode === "latest" ? "selected" : ""} onClick={() => setTestMode("latest")}>
                    Latest (live)
                  </button>
                </div>
                <label className="switch-line">
                  <input type="checkbox" checked={refreshBeforeTest} onChange={(e) => setRefreshBeforeTest(e.target.checked)} />
                  <span>Refresh data from live API before test</span>
                </label>
                {testMode === "historical" && (
                  <label className="control-group">
                    Test date: {testDateLabel}
                    <input
                      type="range"
                      min={95 + Math.round(horizon)}
                      max={maxCutoff}
                      value={cutoffIndex}
                      onChange={(e) => setCutoffIndex(Number(e.target.value))}
                    />
                  </label>
                )}
                <button
                  type="button"
                  className="primary"
                  disabled={!activeTicker || !!busy || !Object.keys(settings).length}
                  onClick={() => runStockTestAction(activeTicker, { mode: testMode, cutoff: cutoffIndex })}
                >
                  {busy === "stock" ? "Testing…" : testMode === "latest" ? "Run latest signal" : "Run historical test"}
                </button>
              </section>

              {stockResult && (
                <>
                  {stockResult.quote && (
                    <section className="metric-grid" aria-label="Live quote">
                      <MetricCard
                        accent="accent-blue"
                        label={`Live quote (${stockResult.quote.provider})`}
                        value={`$${fmt(stockResult.quote.price, 2)}`}
                        note={`As of ${stockResult.quote.asOf}${stockResult.quote.delayed ? " · delayed" : ""}`}
                      />
                    </section>
                  )}

                  <section className="metric-grid" aria-label="Stock test metrics">
                    <MetricCard accent="accent-green" label="Predicted direction" value={stockResult.bias} note={`${pct(stockResult.probabilityUp)} probability up`} />
                    <MetricCard accent="accent-blue" label="Predicted move" value={pct(stockResult.predictedReturn)} note={`Expected ${pct(stockResult.expectedMove)}`} />
                    <MetricCard
                      accent="accent-gold"
                      label={stockResult.mode === "latest" ? "Outcome" : "Actual move"}
                      value={stockResult.realizedReturn == null ? "Pending" : pct(stockResult.realizedReturn)}
                      note={
                        stockResult.mode === "latest"
                          ? `Signal date ${stockResult.date}`
                          : stockResult.directionCorrect
                            ? "Direction passed"
                            : "Direction missed"
                      }
                    />
                    <MetricCard accent="accent-red" label="Options edge" value={pct(stockResult.movementEdge)} note={`Implied ${pct(stockResult.impliedMove)}`} />
                  </section>

                  <section className="chart-band">
                    <div className="chart-panel price-panel">
                      <div className="panel-heading">
                        <h2>Historical window</h2>
                        <span>{stockResult.coverage}</span>
                      </div>
                      <Sparkline rows={stockResult.series || []} />
                    </div>
                    <div className="chart-panel">
                      <div className="panel-heading">
                        <h2>Point signal</h2>
                        <span>Raw {fmt(stockResult.rawScore, 2)}</span>
                      </div>
                      <SignalGauge probability={stockResult.probabilityUp} />
                    </div>
                  </section>

                  <section className="detail-grid wide">
                    <article className="detail-panel">
                      <div className="panel-heading">
                        <h2>Pre-date backtest</h2>
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
                        <h2>Option contracts</h2>
                        <span>{stockResult.options?.provider || "chain"}</span>
                      </div>
                      <OptionsContracts options={stockResult.options} />
                    </article>

                    <article className="detail-panel">
                      <div className="panel-heading">
                        <h2>Decision gate</h2>
                        <span>{stockResult.directionCorrect == null ? "live" : stockResult.directionCorrect ? "passed" : "failed"}</span>
                      </div>
                      <p className="discipline-text">
                        {stockResult.mode === "latest" ? (
                          <>
                            As of {stockResult.date} (close {fmt(stockResult.close, 2)}), the trained model signals{" "}
                            {stockResult.bias.toLowerCase()} with {pct(stockResult.probabilityUp)} probability up over the next{" "}
                            {horizon} sessions.
                          </>
                        ) : (
                          <>
                            At {stockResult.date}, the model predicted {stockResult.bias.toLowerCase()} with{" "}
                            {pct(stockResult.probabilityUp)} probability up. Actual move by {stockResult.futureDate}:{" "}
                            {pct(stockResult.realizedReturn)}.
                          </>
                        )}
                      </p>
                      <div className="discipline-badge">
                        <BarChart3 size={18} /> All metrics from downloaded CSV + trained weights.
                      </div>
                    </article>
                  </section>
                </>
              )}
            </>
          )}
        </section>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
