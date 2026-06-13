import React from "react";
import { Alert, Box, Stack, Typography, Chip } from "@mui/material";
import { Science as ScienceIcon, Assessment as AssessmentIcon, Storage as StorageIcon, Insights as InsightsIcon } from "@mui/icons-material";
import { MetricCard } from "../common/MetricCard";
import { SectionCard } from "../common/SectionCard";

export default function EvalsView() {
  return (
    <Stack spacing={4}>
      <Box>
        <Typography variant="h4" gutterBottom>Model Evaluation Framework</Typography>
        <Typography variant="body1" color="text.secondary">
          Mathematical validation of Agentic AI outputs against historical ground truth data.
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3 }}>
        <MetricCard color="info" label="Judge Model" value="GPT-4o" note="Factual consistency judge" icon={ScienceIcon} />
        <MetricCard color="success" label="Last Pass Rate" value="98.2%" note="Factual accuracy score" icon={AssessmentIcon} />
        <MetricCard color="secondary" label="Test Corpus" value="150+" note="Historical test scenarios" icon={StorageIcon} />
      </Box>

      <SectionCard title="Evaluation Metrics" icon={InsightsIcon}>
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          <Box>
            <Typography variant="subtitle1" fontWeight={800} gutterBottom>Factual Consistency</Typography>
            <Typography variant="body2" color="text.secondary">
              Measures how well the AI Agent adheres to deterministic quantitative data from the ML engine. Prevents "hallucinating" prices or indicators.
            </Typography>
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={800} gutterBottom>Conviction Logic</Typography>
            <Typography variant="body2" color="text.secondary">
              Ensures the "Bull" or "Bear" sentiment score is mathematically justified by the underlying news sentiment and technical trend.
            </Typography>
          </Box>
        </Box>
      </SectionCard>

      <Alert severity="info" sx={{ borderRadius: 3 }}>
        <Typography variant="subtitle2" fontWeight={800}>Automated Data Flywheel</Typography>
        <Typography variant="body2">
          Every analysis you run is cross-referenced with realized price action after the horizon expires. High-accuracy pairs are automatically queued for the future autonomous fine-tuning cycle.
        </Typography>
      </Alert>
    </Stack>
  );
}
