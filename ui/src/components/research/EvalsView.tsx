import React from "react";
import { Alert, Box, Stack, Typography } from "@mui/material";
import { Science as ScienceIcon, Assessment as AssessmentIcon, Storage as StorageIcon, Insights as InsightsIcon } from "@mui/icons-material";
import { MetricCard } from "../common/MetricCard";
import { SectionCard } from "../common/SectionCard";

export default function EvalsView() {
  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" gutterBottom>Model Evaluation Framework</Typography>
        <Typography variant="body1" color="text.secondary">
          Reproducible checks for model leakage, calibration, citation integrity, and operational safety.
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
        <MetricCard color="info" label="Core checks" value="Deterministic" note="No API key required" icon={ScienceIcon} />
        <MetricCard color="success" label="Validation" value="Walk-forward" note="Purged chronological folds" icon={AssessmentIcon} />
        <MetricCard color="secondary" label="Evidence" value="Cited IDs" note="Unknown citations are rejected" icon={StorageIcon} />
      </Box>

      <SectionCard title="Evaluation Metrics" icon={InsightsIcon}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={800} gutterBottom>Grounding contract</Typography>
            <Typography variant="body2" color="text.secondary">
              Structured output is schema-validated, must cite evidence from the exact research packet, and is rejected when an evidence ID is unknown.
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={800} gutterBottom>Backtest integrity</Typography>
            <Typography variant="body2" color="text.secondary">
              Expanding training windows, a horizon-sized purge gap, non-overlapping positions, costs, compounding, and confidence intervals make assumptions visible.
            </Typography>
          </Box>
        </Box>
      </SectionCard>

      <Alert severity="info" sx={{ borderRadius: 3 }}>
        <Typography variant="subtitle2" fontWeight={800}>No fabricated scorecard</Typography>
        <Typography variant="body2">
          This page intentionally does not display a pass rate unless it was produced by the checked-in evaluation command. Run <code>python evals/run_evals.py</code> to generate the report.
        </Typography>
      </Alert>
    </Stack>
  );
}
