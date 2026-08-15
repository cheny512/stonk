import React from "react";
import { Alert, Box, Chip, Stack, Typography } from "@mui/material";
import { fmt, pct, largeNumber, metricColor } from "../../lib/format";
import { MetricMini } from "../common/MetricMini";

interface ResearchSummaryPanelProps {
  summary?: any;
  error?: string;
}

export function ResearchSummaryPanel({ summary, error }: ResearchSummaryPanelProps) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!summary) return <Alert severity="info">Detailed research snapshot will load after a ticker is selected.</Alert>;
  const fundamentals = summary.fundamentals?.metrics || {};
  const trend = summary.analysis?.trend || "mixed";
  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
        <Box>
          <Typography variant="h6" fontWeight={850}>{summary.fundamentals?.name || summary.ticker}</Typography>
          <Typography variant="body2" color="text.secondary">
            {[summary.fundamentals?.sector, summary.fundamentals?.industry].filter(Boolean).join(" · ") || "Public-market research snapshot"}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} alignItems="center">
          {summary.dataAsOf && <Chip size="small" variant="outlined" label={`Data as of ${summary.dataAsOf}`} />}
          <Chip label={trend.replace(/^./, (value: string) => value.toUpperCase())} color={trend === "uptrend" ? "success" : trend === "downtrend" ? "error" : "default"} />
        </Stack>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5 }}>
        <MetricMini label="Market Cap" value={largeNumber(fundamentals.marketCap)} />
        <MetricMini label="P/E Ratio" value={fmt(fundamentals.trailingPE)} />
        <MetricMini label="Volatility" value={pct(summary.volatility?.realized1y)} color="error" />
        <MetricMini label="RSI 14" value={fmt(summary.indicators?.rsi14)} color={summary.indicators?.rsi14 > 70 ? "error" : summary.indicators?.rsi14 < 30 ? "success" : "default"} />
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" }, gap: 1.5 }}>
        <MetricMini label="Return 1M" value={pct(summary.history?.return1m)} color={metricColor(summary.history?.return1m)} />
        <MetricMini label="Return 1Y" value={pct(summary.history?.return1y)} color={metricColor(summary.history?.return1y)} />
        <MetricMini label="ATR 14" value={pct(summary.volatility?.atr14)} />
        <MetricMini label="Rel Volume" value={fmt(summary.indicators?.relativeVolume)} color={summary.indicators?.relativeVolume > 2 ? "success" : "default"} />
      </Box>
      {summary.analysis?.observations?.length > 0 && (
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: "action.hover" }}>
          <Typography variant="overline" color="text.secondary" fontWeight={800}>What the data says</Typography>
          <Typography variant="body2">{summary.analysis.observations.join(" ")}</Typography>
          <Typography variant="caption" color="text.secondary">{summary.analysis.methodology}</Typography>
        </Box>
      )}
      {summary.provenance?.freshnessWarning && (
        <Alert severity="info" icon={false}>{summary.provenance.freshnessWarning}</Alert>
      )}
    </Stack>
  );
}
