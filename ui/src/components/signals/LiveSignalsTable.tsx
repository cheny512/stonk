import React from "react";
import { Card, CardContent, Chip, Stack, Typography, Box, Alert } from "@mui/material";
import { LiveSignalsResponse } from "../../types";
import { fmt, pct, metricColor } from "../../lib/format";
import { MetricMini } from "../common/MetricMini";

interface LiveSignalsTableProps {
  payload?: LiveSignalsResponse;
}

export function LiveSignalsTable({ payload }: LiveSignalsTableProps) {
  if (!payload?.signals?.length) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 3 }}>
      {payload.signals.map((signal) => (
        <Card variant="outlined" key={signal.ticker} sx={{ transition: 'transform 0.2s', "&:hover": { transform: 'translateY(-4px)', boxShadow: "0 8px 24px rgba(0,0,0,0.08)" } }}>
          <CardContent>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
              <Typography variant="h6" fontWeight={800}>{signal.ticker}</Typography>
              <Chip color={signal.signal === "BULLISH" ? "success" : signal.signal === "BEARISH" ? "error" : "default"} label={signal.signal} size="small" />
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5 }}>
              <MetricMini label="Up Prob" value={pct(signal.probability)} />
              <MetricMini label="Edge" value={pct(signal.expectedReturn)} color={metricColor(signal.expectedReturn)} />
              <MetricMini label="Price" value={`$${fmt(signal.price)}`} />
            </Box>
            {signal.options?.available && signal.options.quotes?.[0] && (
              <Alert severity="info" sx={{ mt: 2, py: 0, "& .MuiAlert-message": { fontSize: '0.8rem' } }}>
                {signal.options.quotes[0].strike} {signal.options.quotes[0].right.toUpperCase()} · ${fmt(signal.options.quotes[0].mid)}
              </Alert>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}
