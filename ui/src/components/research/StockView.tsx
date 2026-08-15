import React from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Collapse,
  Divider,
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
  Tune as TuneIcon,
} from "@mui/icons-material";

import {
  fetchDatasetMeta,
  fetchInsiderActivity,
  fetchStock,
  fetchStockHistory,
  fetchStockResearch,
  runStockAutopilot,
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
import { AutopilotPlan } from "./AutopilotPlan";
import { JudgmentGuide } from "./JudgmentGuide";
import { ResearchSummaryPanel } from "./ResearchSummaryPanel";
import { CurrentEventsPanel } from "./CurrentEventsPanel";
import { AiAnalystPanel } from "./AiAnalystPanel";
import { StockHistory, StockTestRequest, Dataset } from "../../types";

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
  const [autopilotResult, setAutopilotResult] = React.useState<any>(null);
  const [autopilotBusy, setAutopilotBusy] = React.useState(false);
  const [autopilotError, setAutopilotError] = React.useState("");
  const autopilotRequestId = React.useRef(0);
  const [priceHistory, setPriceHistory] = React.useState<StockHistory | null>(null);
  const [researchSummary, setResearchSummary] = React.useState<any>(null);
  const [researchError, setResearchError] = React.useState("");
  const [insiderActivity, setInsiderActivity] = React.useState<any>(null);
  const [insiderError, setInsiderError] = React.useState("");
  const [showResearchTools, setShowResearchTools] = React.useState(false);

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

  const runAutopilotAction = async (ticker: string, refresh = false) => {
    const requestId = ++autopilotRequestId.current;
    setAutopilotBusy(true);
    setAutopilotError("");
    setAutopilotResult(null);
    try {
      const result = await runStockAutopilot(ticker, {
        refresh,
        years: 10,
        provider: "auto",
        horizon: clamp(Math.round(config.horizon), 1, 90),
        confidence: clamp(config.confidence, 0.51, 0.9),
        dte: clamp(Math.round(config.dte), 1, 730),
        iv: clamp(config.iv / 100, 0.01, 3),
        tradeCost: clamp(config.tradeCost / 100, 0, 0.2),
        trainFraction: clamp(config.trainFraction, 0.5, 0.9),
        includeOptions: true,
      });
      if (requestId !== autopilotRequestId.current) return;
      setAutopilotResult(result);
      setStockResult(result);
      setResearchSummary(result.research);
      setResearchError("");
    } catch (err: any) {
      if (requestId === autopilotRequestId.current) setAutopilotError(err.message);
    } finally {
      if (requestId === autopilotRequestId.current) setAutopilotBusy(false);
    }
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
    setPriceHistory(null);
    setStockResult(null);
    setAutopilotResult(null);
    try {
      const fetched = await fetchStock({ ticker, years: 10, provider: "auto" });
      const history = await fetchStockHistory(ticker);
      setPriceHistory({ ...history, provider: fetched.provider });
      setActiveTicker(ticker);
      setTickerInput(ticker);
      await applyDatasetMeta(ticker);
      loadInsiders(ticker);
      void loadResearchSummary(ticker);
      void runAutopilotAction(ticker, false);
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
    setPriceHistory(null);
    setStockResult(null);
    setAutopilotResult(null);
    try {
      const history = await fetchStockHistory(symbol);
      setPriceHistory(history);
      await applyDatasetMeta(symbol);
      loadInsiders(symbol);
      void loadResearchSummary(symbol);
      void runAutopilotAction(symbol, true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <Stack spacing={{ xs: 3, md: 5 }} sx={{ maxWidth: 1180, mx: "auto" }}>
      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}

      <Box>
        <Typography variant="h4" sx={{ mb: 0.75 }}>Stocks</Typography>
        <Typography color="text.secondary" sx={{ mb: 2.5 }}>Price history, market context, and research in one place.</Typography>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ xs: "stretch", sm: "center" }}>
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
            renderInput={(params) => <TextField {...params} label="Search stocks and ETFs" placeholder="AAPL, TSLA, NVDA…" variant="outlined" />}
          />
          <Button 
            variant="contained" 
            size="large"
            onClick={() => loadTicker()} 
            disabled={!!busy || !backendOnline}
            sx={{ px: 4, minWidth: 132, height: 56, borderRadius: 3 }}
          >
            {busy === "fetch" ? "Loading market data…" : "Analyze"}
          </Button>
        </Stack>
      </Box>

      {priceHistory && (
        <Box id="price-history">
          <PriceChart
            rows={priceHistory.series}
            range={timeRange}
            ticker={priceHistory.ticker}
            provider={priceHistory.provider}
            asOf={priceHistory.end}
            events={researchSummary?.events?.items || []}
          />
          <ToggleButtonGroup
            size="small"
            exclusive
            value={timeRange}
            onChange={(_, value) => value && setTimeRange(value)}
            sx={{
              mt: 1,
              maxWidth: "100%",
              overflowX: "auto",
              "& .MuiToggleButton-root": { border: 0, borderRadius: "8px !important", px: { xs: 1.25, sm: 2 }, fontWeight: 750 },
              "& .Mui-selected": { color: "primary.main", bgcolor: "rgba(20, 108, 92, 0.08) !important" },
            }}
          >
              {["5D", "1M", "3M", "6M", "YTD", "1Y", "5Y", "ALL"].map((range) => (
                <ToggleButton key={range} value={range}>{range}</ToggleButton>
              ))}
          </ToggleButtonGroup>
        </Box>
      )}

      {activeTicker && (
        <Box>
          <Divider sx={{ mb: 2 }} />
          <Button startIcon={<TuneIcon />} onClick={() => setShowResearchTools((open) => !open)} color="inherit">
            {showResearchTools ? "Hide research tools" : "Research tools"}
          </Button>
          <Collapse in={showResearchTools}>
            <Paper variant="outlined" sx={{ p: { xs: 2, md: 3 }, mt: 2 }}>
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
          </Collapse>
        </Box>
      )}

      {(activeTicker || researchSummary || researchError) && (
        <SectionCard
          id="research-snapshot"
          title="Research snapshot"
          icon={SavedSearchIcon}
          action={<Button size="small" variant="outlined" onClick={() => loadResearchSummary(activeTicker)}>Synchronize</Button>}
        >
          <ResearchSummaryPanel summary={researchSummary} error={researchError} />
        </SectionCard>
      )}

      {activeTicker && (
        <SectionCard
          id="autopilot-plan"
          title="Autopilot thesis & trade plan"
          icon={InsightsIcon}
          action={<Button size="small" onClick={() => runAutopilotAction(activeTicker, true)} disabled={autopilotBusy}>Run again</Button>}
        >
          <AutopilotPlan result={autopilotResult} loading={autopilotBusy} error={autopilotError} />
        </SectionCard>
      )}

      {activeTicker && (
        <SectionCard
          id="research-coach"
          title="Research coach"
          icon={InsightsIcon}
          action={<Chip size="small" label={aiEnabled ? "Grounded AI" : "Local rules"} color={aiEnabled ? "success" : "default"} />}
        >
          <AiAnalystPanel ticker={activeTicker} />
        </SectionCard>
      )}

      {activeTicker && (
        <SectionCard
          id="judgment-guide"
          title={`How to evaluate ${activeTicker}`}
          icon={AssessmentIcon}
        >
          <JudgmentGuide research={researchSummary} result={autopilotResult} />
        </SectionCard>
      )}

      {(activeTicker || researchSummary) && (
        <SectionCard
          id="current-events"
          title="Latest news"
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
            <MetricCard icon={AutoGraphIcon} color="success" label="Model outlook" value={stockResult.bias} note={`${pct(stockResult.probabilityUp)} probability up`} />
            <MetricCard icon={InsightsIcon} color="secondary" label="Forecast move" value={pct(stockResult.predictedReturn)} note={`Expected ${pct(stockResult.expectedMove)}`} />
            <MetricCard
              icon={ScienceIcon}
              color="warning"
              label={stockResult.mode === "latest" ? "Signal status" : "Observed return"}
              value={stockResult.realizedReturn == null ? "Pending" : pct(stockResult.realizedReturn)}
              note={stockResult.mode === "latest" ? "Monitoring" : `Resolved ${stockResult.futureDate}`}
            />
            <MetricCard
              icon={AccountBalanceIcon}
              color="error"
              label="Options edge"
              value={stockResult.options?.available ? pct(stockResult.movementEdge) : "--"}
              note={stockResult.options?.available ? `Implied: ${pct(stockResult.impliedMove)}` : "No authorized live chain"}
            />
          </Box>

          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 3 }}>
            <SectionCard
              id="backtest"
              title={stockResult.walkForward?.folds ? "Purged walk-forward validation" : "Chronological validation"}
              icon={AssessmentIcon}
              action={<Chip label={stockResult.walkForward?.folds ? `${stockResult.walkForward.folds.length} folds` : `${stockResult.backtest?.testCount || 0} rows`} />}
            >
              <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.5, mb: 3 }}>
                <MetricMini label="Historical Accuracy" value={pct(stockResult.walkForward?.accuracy_all ?? stockResult.backtest?.accuracy)} />
                <MetricMini label="Signal Hit Rate" value={pct(stockResult.walkForward?.signal_hit_rate ?? stockResult.backtest?.hitRate)} />
                <MetricMini label="Generated Signals" value={String(stockResult.walkForward?.signal_count ?? stockResult.backtest?.signalCount ?? 0)} />
                <MetricMini label="Excess vs buy & hold" value={stockResult.walkForward ? pct(stockResult.walkForward.excess_return) : "--"} />
              </Box>
              {stockResult.walkForward?.hit_rate_ci_95 && (
                <Alert severity="info" icon={false} sx={{ mb: 2 }}>
                  95% hit-rate interval: {pct(stockResult.walkForward.hit_rate_ci_95[0])}–{pct(stockResult.walkForward.hit_rate_ci_95[1])}. Positions do not overlap; the prediction horizon is purged between train and test.
                </Alert>
              )}
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
        <Box sx={{ py: { xs: 8, md: 14 }, textAlign: "center" }}>
          <ShowChartIcon sx={{ fontSize: 44, color: 'divider', mb: 2 }} />
          <Typography variant="h5">Start with a symbol</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
            Search any US-listed stock to explore its price history and research context.
          </Typography>
        </Box>
      )}
    </Stack>
  );
}
