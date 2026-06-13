import React from "react";
import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import {
  Assessment as AssessmentIcon,
  AutoGraph as AutoGraphIcon,
  CloudSync as CloudSyncIcon,
  Insights as InsightsIcon,
  Science as ScienceIcon,
  Storage as StorageIcon,
} from "@mui/icons-material";

import { Dataset } from "../../types";
import { MetricCard } from "../common/MetricCard";
import { SectionCard } from "../common/SectionCard";
import { RankingTable } from "../rankings/RankingTable";
import { LiveSignalsTable } from "../signals/LiveSignalsTable";
import { pct, fmt } from "../../lib/format";
import { trainResearch } from "../../api/client";
import { clamp } from "../../engine";

interface ResearchViewProps {
  model: any;
  config: any;
  datasets: Dataset[];
  setDatasets: React.Dispatch<React.SetStateAction<Dataset[]>>;
  backendOnline: boolean;
}

export default function ResearchView({ model, config, datasets, setDatasets, backendOnline }: ResearchViewProps) {
  const [busy, setBusy] = React.useState(false);
  const selectedTickers = React.useMemo(
    () => datasets.filter((dataset) => dataset.selected && dataset.ready).map((dataset) => dataset.ticker),
    [datasets],
  );

  const runTrain = async () => {
    if (!selectedTickers.length) return;
    setBusy(true);
    try {
      const trained = await trainResearch({
        tickers: selectedTickers,
        horizon: clamp(Math.round(model.horizon), 1, 90),
        catalysts: model.catalysts,
        method: "autonomous",
        modelType: model.modelType as any,
        refine: model.modelType === "logistic",
        trainFraction: clamp(model.trainFraction, 0.5, 0.9),
        confidence: clamp(model.confidence, 0.51, 0.9),
      });
      model.setSettings(trained.settings || {});
      model.setRankings(trained.rankings || []);
      model.setTrainSamples(trained.totalRows || 0);
      model.setTrainValidation(trained.validation || null);
      model.setTrainMethod(trained.method || "autonomous");
      model.setStatus(`Trained ${trained.method || "model"} on ${trained.totalRows || 0} samples`);
    } catch (err: any) {
      model.setStatus(`Error: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const updateWeight = (key: string, value: number) => {
    model.setSettings((current: any) => ({
      ...current,
      [key]: { ...current[key], weight: clamp(value, -3, 3) },
    }));
  };

  const updateToggle = (key: string, enabled: boolean) => {
    model.setSettings((current: any) => ({ ...current, [key]: { ...current[key], enabled } }));
  };

  return (
    <Stack spacing={4}>
      {(model.portfolio || model.trainValidation) && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 3 }}>
          {model.portfolio ? (
            <>
              <MetricCard icon={AssessmentIcon} color="success" label="Aggregate Accuracy" value={pct(model.portfolio.accuracy)} note={`${model.portfolio.testCount} cross-validated rows`} />
              <MetricCard icon={InsightsIcon} color="secondary" label="Signal Hit Rate" value={pct(model.portfolio.hitRate)} note={`${model.portfolio.signalCount} generated signals`} />
              <MetricCard icon={AutoGraphIcon} color="warning" label="Expectancy" value={pct(model.portfolio.expectancy)} note="Return per signal" />
              <MetricCard icon={AssessmentIcon} color="error" label="Max Drawdown" value={pct(model.portfolio.maxDrawdown)} note="System peak-to-trough" />
            </>
          ) : (
            <>
              <MetricCard icon={AssessmentIcon} color="success" label="Hold-out Accuracy" value={pct(model.trainValidation.accuracy)} note={model.trainMethod} />
              <MetricCard icon={InsightsIcon} color="secondary" label="Validation Hit Rate" value={pct(model.trainValidation.hitRate)} note={`${model.trainValidation.signalCount} signals`} />
              <MetricCard icon={AutoGraphIcon} color="warning" label="Brier Score" value={fmt(model.trainValidation.brier, 4)} note="Calibration" />
              <MetricCard icon={StorageIcon} color="primary" label="Training Samples" value={String(model.trainSamples)} note="Observation count" />
            </>
          )}
        </Box>
      )}

      {model.liveSignals && (
        <SectionCard title="Multi-Asset Real-time Scan" icon={CloudSyncIcon} action={<Chip label={`${model.liveSignals.count} assets`} />}>
          <LiveSignalsTable payload={model.liveSignals} />
        </SectionCard>
      )}

      {model.rankings.length > 0 && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.4fr 0.6fr" }, gap: 3 }}>
          <SectionCard title="Learned Coefficients" icon={ScienceIcon} action={<Chip label={`${model.trainSamples} rows`} />}>
            <RankingTable rankings={model.rankings} settings={model.settings} onToggle={updateToggle} onWeight={updateWeight} />
          </SectionCard>
          {model.portfolio && (
            <SectionCard title="Performance Matrix" icon={AssessmentIcon}>
              <Stack spacing={1.5}>
                {model.portfolio.results.map((item: any) => (
                  <Paper variant="outlined" sx={{ p: 2, "&:hover": { borderColor: 'primary.main' } }} key={item.ticker}>
                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                      <Typography variant="subtitle2" fontWeight={800}>{item.ticker}</Typography>
                      <Chip size="small" variant="outlined" label={item.coverage} />
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                      Accuracy: <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>{pct(item.backtest.accuracy)}</Box> · 
                      Hit: <Box component="span" sx={{ color: 'secondary.main', fontWeight: 700 }}>{pct(item.backtest.hitRate)}</Box>
                    </Typography>
                  </Paper>
                ))}
              </Stack>
            </SectionCard>
          )}
        </Box>
      )}

      {!model.rankings.length && !model.portfolio && (
        <Paper variant="outlined" sx={{ p: 10, textAlign: 'center', borderRadius: 4, bgcolor: '#fff' }}>
          <InsightsIcon sx={{ fontSize: 64, color: 'divider', mb: 2 }} />
          <Typography variant="h5" color="text.secondary">Ready for Analysis</Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mt: 1, mb: 4 }}>
            Select tickers in the sidebar and trigger the optimization cycle.
          </Typography>
          <Button variant="contained" size="large" onClick={runTrain} disabled={!selectedTickers.length || busy}>
            {busy ? "Training..." : "Initialize Neural Cycle"}
          </Button>
        </Paper>
      )}
    </Stack>
  );
}
