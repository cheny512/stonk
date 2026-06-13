import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Container,
  FormControlLabel,
  Paper,
  Slider,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  AccountBalance as AccountBalanceIcon,
  Assessment as AssessmentIcon,
  AutoGraph as AutoGraphIcon,
  CloudSync as CloudSyncIcon,
  Insights as InsightsIcon,
  Refresh as RefreshIcon,
  SavedSearch as SavedSearchIcon,
  Science as ScienceIcon,
  ShowChart as ShowChartIcon,
} from "@mui/icons-material";

import {
  fetchDatasetMeta,
  fetchInsiderActivity,
  fetchStock,
  fetchStockResearch,
  runStockTest,
} from "../../api/client";
import { clamp } from "../../engine";
import { fmt, pct, largeNumber } from "../../lib/format";
import { MetricCard } from "../common/MetricCard";
import { MetricMini } from "../common/MetricMini";
import { SectionCard } from "../common/SectionCard";
import { PriceChart } from "../chart/PriceChart";
import { EquityCurve } from "../chart/EquityCurve";
import { OptionsContracts } from "../options/OptionsContracts";
import { InsiderPanel } from "../insider/InsiderPanel";
import { ResearchSummaryPanel } from "./ResearchSummaryPanel";
import { AiAnalystPanel } from "./AiAnalystPanel";
import { CurrentEventsPanel } from "./CurrentEventsPanel";
import { StockTestRequest, Dataset } from "../../types";

interface StockViewProps {
  aiEnabled: boolean;
  backendOnline: boolean;
  model: any;
  config: any;
  datasets: Dataset[];
  refreshUniverse: () => Promise<void>;
}

export default function StockView({ aiEnabled, backendOnline, model, config, datasets, refreshUniverse }: StockViewProps) {
  const [activeTicker, setActiveTicker] = React.useState("");
  const [tickerInput, setTickerInput] = React.useState("");
  const [testMode, setTestMode] = React.useState<"historical" | "latest">("historical");
  const [refreshBeforeTest, setRefreshBeforeTest] = React.useState(true);
  const [cutoffIndex, setCutoffIndex] = React.useState(360);
  const [maxCutoff, setMaxCutoff] = React.useState(400);
  const [dateLabels, setDateLabels] = React.useState<string[]>([]);
  const [timeRange, setTimeRange] = React.useState("1Y");
  const [busy, setBusy] = React.useState("");
  const [error, setError] = React.useState("");
  const [stockResult, setStockResult] = React.useState<any>(null);
  const [researchSummary, setResearchSummary] = React.useState<any>(null);
  const [researchError, setResearchError] = React.useState("");
  const [insiderActivity, setInsiderActivity] = React.useState<any>(null);
  const [insiderError, setInsiderError] = React.useState("");

  const readyTickers = model.readyTickers || [];
  const modelReady = Object.keys(model.settings).length > 0;
  const sliderMin = Math.min(maxCutoff, 70 + Math.round(config.horizon));
  const testDateLabel = dateLabels[cutoffIndex] || stockResult?.date || "--";

  const loadInsiders = React.useCallback(async (ticker: string) => {
    if (!ticker) return;
    setInsiderActivity(null);
    setInsiderError("");
    try {
      setInsiderActivity(await fetchInsiderActivity(ticker));
    } catch (err: any) {
      setInsiderError(err.message);
    }
  }, []);

  const loadResearchSummary = React.useCallback(async (ticker: string) => {
    if (!ticker) return;
    setResearchSummary(null);
    setResearchError("");
    try {
      setResearchSummary(await fetchStockResearch(ticker));
    } catch (err: any) {
      setResearchError(err.message);
    }
  }, []);

  const applyDatasetMeta = async (ticker: string) => {
    const meta = await fetchDatasetMeta(ticker);
    setDateLabels(meta.dates || []);
    setMaxCutoff(meta.maxCutoff);
    const min = Math.min(meta.maxCutoff, 70 + Math.round(config.horizon));
    setCutoffIndex(Math.min(meta.maxCutoff, Math.max(min, meta.maxCutoff - 1)));
  };

  const runStockTestAction = async (ticker: string, { cutoff, mode, silent = false }: any = {}) => {
    const symbol = (ticker || "").trim().toUpperCase();
    if (!symbol || !modelReady) {
      if (!silent) setError("Select a ticker and train or load a model first.");
      return;
    }
    const useMode = mode || testMode;
    setBusy("stock");
    setError("");
    try {
      const result = await runStockTest({
        ticker: symbol,
        mode: useMode,
        cutoffIndex: useMode === "historical" ? cutoff ?? cutoffIndex : undefined,
        refresh: refreshBeforeTest,
        years: 10,
        provider: "auto",
        horizon: clamp(Math.round(config.horizon), 1, 90),
        confidence: clamp(config.confidence, 0.51, 0.9),
        settings: model.settings,
        catalysts: config.catalysts,
        dte: clamp(Math.round(config.dte), 1, 730),
        iv: clamp(config.iv / 100, 0.01, 3),
        tradeCost: clamp(config.tradeCost / 100, 0, 0.2),
        trainFraction: clamp(config.trainFraction, 0.5, 0.9),
        includeOptions: true
      } as StockTestRequest);
      setStockResult(result);
      if (result.maxCutoff != null) setMaxCutoff(result.maxCutoff);
      if (result.dates) setDateLabels(result.dates);
      if (result.cutoffIndex != null) setCutoffIndex(result.cutoffIndex);
    } catch (err: any) {
      if (!silent) setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const loadTicker = async (symbol = tickerInput) => {
    const ticker = (symbol || "").trim().toUpperCase();
    if (!ticker) return;
    setBusy("fetch");
    setError("");
    try {
      await fetchStock({ ticker, years: 10, provider: "auto" });
      setActiveTicker(ticker);
      setTickerInput(ticker);
      await applyDatasetMeta(ticker);
      loadResearchSummary(ticker);
      loadInsiders(ticker);
      if (modelReady) {
        await runStockTestAction(ticker, { mode: testMode, silent: true });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const onActiveTickerChange = async (ticker: string) => {
    if (!ticker) return;
    const symbol = ticker.toUpperCase();
    setActiveTicker(symbol);
    setTickerInput(symbol);
    try {
      await applyDatasetMeta(symbol);
      loadResearchSummary(symbol);
      loadInsiders(symbol);
      if (modelReady) {
        await runStockTestAction(symbol, { mode: testMode, silent: true });
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <Stack spacing={4}>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      
      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ xs: "stretch", md: "center" }}>
          <Autocomplete
            freeSolo
            fullWidth
            options={readyTickers}
            value={tickerInput}
            inputValue={tickerInput}
            onInputChange={(_, value) => setTickerInput(value.toUpperCase())}
            onChange={(_, value) => {
              const symbol = String(value || "").toUpperCase();
              setTickerInput(symbol);
              if (readyTickers.includes(symbol)) onActiveTickerChange(symbol);
            }}
            renderInput={(params) => <TextField {...params} label="Search Equity Symbol" placeholder="e.g. AAPL, TSLA, NVDA" variant="filled" />}
          />
          <Button 
            variant="contained" 
            size="large"
            startIcon={<SavedSearchIcon />} 
            onClick={() => loadTicker()} 
            disabled={!!busy || !backendOnline}
            sx={{ px: 6, py: 2 }}
          >
            {busy === "fetch" ? "Injesting..." : "Analyze"}
          </Button>
        </Stack>
      </Paper>

      {(activeTicker || tickerInput) && (
        <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, bgcolor: '#fff', position: 'sticky', top: 88, zIndex: 10 }}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
            <Button size="small" variant="text" href="#research-snapshot">Research</Button>
            <Button size="small" variant="text" href="#ai-synthesis">AI Synthesis</Button>
            <Button size="small" variant="text" href="#current-events">Events</Button>
            <Button size="small" variant="text" href="#model-signal">Signal</Button>
            <Button size="small" variant="text" href="#price-history">History</Button>
            <Button size="small" variant="text" href="#backtest">Backtest</Button>
            <Button size="small" variant="text" href="#options">Options</Button>
            <Button size="small" variant="text" href="#insiders">Insiders</Button>
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ xs: "stretch", md: "center" }}>
          <ToggleButtonGroup exclusive color="primary" value={testMode} onChange={(_, value) => value && setTestMode(value)} size="small">
            <ToggleButton value="historical" sx={{ px: 3 }}><ShowChartIcon sx={{ mr: 1 }} /> Backtest</ToggleButton>
            <ToggleButton value="latest" sx={{ px: 3 }}><CloudSyncIcon sx={{ mr: 1 }} /> Live Signal</ToggleButton>
          </ToggleButtonGroup>
          
          <FormControlLabel
            control={<Switch checked={refreshBeforeTest} onChange={(event) => setRefreshBeforeTest(event.target.checked)} />}
            label="Hot-reload"
          />

          {testMode === "historical" && (
            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Typography variant="caption" fontWeight={700}>Simulation: {testDateLabel}</Typography>
              <Slider min={sliderMin} max={maxCutoff} value={Math.min(cutoffIndex, maxCutoff)} onChange={(_, value) => setCutoffIndex(value as number)} />
            </Box>
          )}
          
          <Button
            variant="outlined"
            size="large"
            startIcon={<ScienceIcon />}
            disabled={!(activeTicker || tickerInput) || !!busy || !modelReady || !backendOnline}
            onClick={() => runStockTestAction(activeTicker || tickerInput, { mode: testMode, cutoff: cutoffIndex })}
          >
            {busy === "stock" ? "Computing..." : "Run Test"}
          </Button>
        </Stack>
      </Paper>

      {(activeTicker || tickerInput || researchSummary || researchError) && (
        <SectionCard
          id="research-snapshot"
          title="Deep Quant Research"
          icon={SavedSearchIcon}
          action={<Button size="small" variant="outlined" onClick={() => loadResearchSummary(activeTicker || tickerInput)}>Synchronize</Button>}
        >
          <ResearchSummaryPanel summary={researchSummary} error={researchError} />
        </SectionCard>
      )}

      {(activeTicker || tickerInput || researchSummary) && (
        <SectionCard
          id="ai-synthesis"
          title="Agentic AI Synthesis"
          icon={InsightsIcon}
          action={<Chip size="small" color="primary" label="GPT-4o Mini" sx={{ fontWeight: 800 }} />}
        >
          {aiEnabled ? (
            <AiAnalystPanel ticker={activeTicker || tickerInput} />
          ) : (
            <Alert severity="warning" sx={{ borderRadius: 2 }}>
              AI Analyst disabled — set OPENAI_API_KEY on the server to enable autonomous synthesis.
            </Alert>
          )}
        </SectionCard>
      )}

      {(activeTicker || tickerInput || researchSummary) && (
        <SectionCard
          id="current-events"
          title="Market Context"
          icon={RefreshIcon}
          action={<Chip size="small" label={researchSummary?.events?.provider || "news"} />}
        >
          <CurrentEventsPanel events={researchSummary?.events} />
        </SectionCard>
      )}

      {stockResult && (
        <Stack spacing={4}>
          {stockResult.quote && (
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 3 }}>
              <MetricCard color="secondary" label={`Quote (${stockResult.quote.provider})`} value={`$${fmt(stockResult.quote.price)}`} note={stockResult.quote.asOf} />
              <MetricCard color="primary" label="Open" value={`$${fmt(stockResult.quote.open)}`} note="Market start" />
              <MetricCard color="primary" label="High / Low" value={`$${fmt(stockResult.quote.high)} / $${fmt(stockResult.quote.low)}`} note="Daily range" />
              <MetricCard color="primary" label="Volume" value={largeNumber(stockResult.quote.volume)} note={stockResult.quote.delayed ? "Delayed" : "Real-time"} />
            </Box>
          )}

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 3 }}>
            <MetricCard icon={AutoGraphIcon} color="success" label="Intelligence Bias" value={stockResult.bias} note={`${pct(stockResult.probabilityUp)} confidence`} />
            <MetricCard icon={InsightsIcon} color="secondary" label="Target Move" value={pct(stockResult.predictedReturn)} note={`Expected ${pct(stockResult.expectedMove)}`} />
            <MetricCard
              icon={ScienceIcon}
              color="warning"
              label={stockResult.mode === "latest" ? "Signal Maturity" : "Realized Return"}
              value={stockResult.realizedReturn == null ? "Pending" : pct(stockResult.realizedReturn)}
              note={stockResult.mode === "latest" ? "Monitoring" : `Resolved ${stockResult.futureDate}`}
            />
            <MetricCard icon={AccountBalanceIcon} color="error" label="Options Alpha" value={pct(stockResult.movementEdge)} note={`Implied: ${pct(stockResult.impliedMove)}`} />
          </Box>

          <SectionCard
            id="price-history"
            title="Market Trajectory"
            icon={ShowChartIcon}
            action={
              <ToggleButtonGroup size="small" exclusive value={timeRange} onChange={(_, value) => value && setTimeRange(value)}>
                {["5D", "1M", "3M", "6M", "1Y", "5Y", "ALL"].map((range) => (
                  <ToggleButton key={range} value={range}>{range}</ToggleButton>
                ))}
              </ToggleButtonGroup>
            }
          >
            <PriceChart rows={stockResult.series || []} range={timeRange} />
          </SectionCard>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 3 }}>
            <SectionCard id="backtest" title="Local Simulation" icon={AssessmentIcon} action={<Chip label={`${stockResult.backtest?.testCount || 0} rows`} />}>
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.5, mb: 3 }}>
                <MetricMini label="Historical Accuracy" value={pct(stockResult.backtest?.accuracy)} />
                <MetricMini label="Signal Hit Rate" value={pct(stockResult.backtest?.hitRate)} />
                <MetricMini label="Generated Signals" value={String(stockResult.backtest?.signalCount || 0)} />
                <MetricMini label="Profit Factor" value={fmt(stockResult.backtest?.profitFactor, 2)} />
              </Box>
              <EquityCurve trades={stockResult.backtest?.trades} />
            </SectionCard>
            
            <SectionCard id="options" title="Derivative Contracts" icon={AccountBalanceIcon} action={<Chip label={stockResult.options?.provider || "Chain"} />}>
              <OptionsContracts options={stockResult.options} />
            </SectionCard>
          </Box>

          <SectionCard id="insiders" title="Insider Intelligence" icon={AccountBalanceIcon} action={<Button size="small" variant="outlined" onClick={() => loadInsiders(activeTicker || tickerInput)}>Synchronize</Button>}>
            <InsiderPanel activity={insiderActivity} error={insiderError} />
          </SectionCard>
        </Stack>
      )}

      {!activeTicker && !tickerInput && (
        <Paper variant="outlined" sx={{ p: 10, textAlign: 'center', borderRadius: 6, bgcolor: '#fff', borderStyle: 'dashed' }}>
          <SavedSearchIcon sx={{ fontSize: 64, color: 'divider', mb: 2 }} />
          <Typography variant="h5" color="text.secondary">Ready for Research</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            Enter a ticker symbol above to generate high-fidelity analysis.
          </Typography>
        </Paper>
      )}
    </Stack>
  );
}
