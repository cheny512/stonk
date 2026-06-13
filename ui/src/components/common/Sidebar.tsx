import React from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Download as DownloadIcon,
  Science as ScienceIcon,
  Storage as StorageIcon,
} from "@mui/icons-material";

import { SectionCard } from "./SectionCard";
import { DatasetPicker } from "../dataset/DatasetPicker";
import { Dataset } from "../../types";
import { downloadUniverse, trainResearch } from "../../api/client";
import { clamp } from "../../engine";

interface SidebarProps {
  config: any;
  datasets: Dataset[];
  setDatasets: React.Dispatch<React.SetStateAction<Dataset[]>>;
  model: any;
  backendOnline: boolean;
  refreshUniverse: () => Promise<void>;
}

export function Sidebar({
  config,
  datasets,
  setDatasets,
  model,
  backendOnline,
  refreshUniverse,
}: SidebarProps) {
  const [busy, setBusy] = React.useState("");
  const selectedTickers = React.useMemo(
    () => datasets.filter((dataset) => dataset.selected && dataset.ready).map((dataset) => dataset.ticker),
    [datasets],
  );

  const setSelectedTickers = (tickers: string[]) => {
    const selected = new Set(tickers);
    setDatasets((current) => current.map((dataset) => ({ ...dataset, selected: selected.has(dataset.ticker) })));
  };

  const selectAllReady = (on: boolean) => {
    setDatasets((current) => current.map((dataset) => ({ ...dataset, selected: on ? dataset.ready : false })));
  };

  const handleDownload = async () => {
    setBusy("download");
    model.setStatus("Downloading S&P 500 daily history");
    try {
      const result = await downloadUniverse({ years: 10 });
      await refreshUniverse();
      model.setStatus(`Downloaded ${result.downloaded} tickers; ${result.readyCount} ready`);
    } catch (err: any) {
      model.setStatus(`Download failed: ${err.message}`);
    } finally {
      setBusy("");
    }
  };

  const runTrain = async () => {
    if (!selectedTickers.length) return;
    setBusy("train");
    try {
      const trained = await trainResearch({
        tickers: selectedTickers,
        horizon: clamp(Math.round(config.horizon), 1, 90),
        catalysts: config.catalysts,
        method: "autonomous",
        modelType: config.modelType as any,
        refine: config.modelType === "logistic",
        trainFraction: clamp(config.trainFraction, 0.5, 0.9),
        confidence: clamp(config.confidence, 0.51, 0.9),
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
      setBusy("");
    }
  };

  return (
    <Box sx={{ px: 3, py: 2 }}>
      <Box sx={{ mb: 1.5 }}>
        <Typography variant="overline">Global Config</Typography>
      </Box>

      <Stack spacing={2.5}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
          <TextField size="small" label="Horizon" type="number" value={config.horizon} onChange={(e) => config.setHorizon(Number(e.target.value))} inputProps={{ min: 1, max: 90 }} />
          <TextField size="small" label="Signal" type="number" value={config.confidence} onChange={(e) => config.setConfidence(Number(e.target.value))} inputProps={{ min: 0.51, max: 0.9, step: 0.01 }} />
          <TextField size="small" label="DTE" type="number" value={config.dte} onChange={(e) => config.setDte(Number(e.target.value))} inputProps={{ min: 1, max: 730 }} />
          <TextField size="small" label="Cost %" type="number" value={config.tradeCost} onChange={(e) => config.setTradeCost(Number(e.target.value))} inputProps={{ min: 0, max: 20, step: 0.05 }} />
        </Box>

        <FormControl size="small" fullWidth>
          <InputLabel>Neural Engine</InputLabel>
          <Select label="Neural Engine" value={config.modelType} onChange={(e) => config.setModelType(e.target.value)}>
            <MenuItem value="logistic">Logistic Regression</MenuItem>
            <MenuItem value="xgboost">XGBoost Engine</MenuItem>
            <MenuItem value="svm">SVM Kernel</MenuItem>
          </Select>
        </FormControl>

        <SectionCard title="Universe" icon={StorageIcon} action={<Chip size="small" label={`${selectedTickers.length} active`} />}>
          <DatasetPicker datasets={datasets} onChange={setSelectedTickers} onSelectAll={selectAllReady} />
        </SectionCard>

        <Stack spacing={1} sx={{ mt: 1 }}>
          <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleDownload} disabled={!!busy || !backendOnline}>
            Sync S&P 500
          </Button>
          <Button variant="outlined" startIcon={<ScienceIcon />} onClick={runTrain} disabled={!!busy || !backendOnline || !selectedTickers.length}>
            {busy === "train" ? "Optimizing..." : "Train Intelligence"}
          </Button>
          <Button variant="text" size="small" startIcon={<StorageIcon />} onClick={model.loadModel} disabled={!!busy || !backendOnline}>
            Restore Weights
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
