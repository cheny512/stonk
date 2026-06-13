import React from "react";
import { Alert, Box, Stack } from "@mui/material";
import { fmt, pct, largeNumber, metricColor } from "../../lib/format";
import { MetricMini } from "../common/MetricMini";

interface ResearchSummaryPanelProps {
  summary?: any;
  error?: string;
}

export function ResearchSummaryPanel({ summary, error }: ResearchSummaryPanelProps) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!summary) return <Alert severity="info">Detailed research snapshot will load after a ticker is selected.</Alert>;
  return (
    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1.5 }}>
        <MetricMini label="Market Cap" value={largeNumber(summary.fundamentals?.marketCap)} />
        <MetricMini label="P/E Ratio" value={fmt(summary.fundamentals?.peRatio)} />
        <MetricMini label="Volatility" value={pct(summary.volatility?.realized1y)} color="error" />
        <MetricMini label="RSI 14" value={fmt(summary.indicators?.rsi14)} color={summary.indicators?.rsi14 > 70 ? "error" : summary.indicators?.rsi14 < 30 ? "success" : "default"} />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1.5 }}>
        <MetricMini label="Return 1M" value={pct(summary.history?.return1m)} color={metricColor(summary.history?.return1m)} />
        <MetricMini label="Return 1Y" value={pct(summary.history?.return1y)} color={metricColor(summary.history?.return1y)} />
        <MetricMini label="ATR 14" value={pct(summary.volatility?.atr14)} />
        <MetricMini label="Rel Volume" value={fmt(summary.indicators?.relativeVolume)} color={summary.indicators?.relativeVolume > 2 ? "success" : "default"} />
      </Box>
    </Stack>
  );
}
