import React from "react";
import { Alert, Box, Chip, Divider, LinearProgress, Paper, Stack, Typography } from "@mui/material";
import { money, pct, fmt } from "../../lib/format";
import { MetricMini } from "../common/MetricMini";

interface AutopilotPlanProps {
  result?: any;
  loading?: boolean;
  error?: string;
}

export function AutopilotPlan({ result, loading, error }: AutopilotPlanProps) {
  if (loading) {
    return (
      <Stack spacing={1.5}>
        <LinearProgress />
        <Typography color="text.secondary">Refreshing data, running the backtest, and building a trade plan…</Typography>
      </Stack>
    );
  }
  if (error) return <Alert severity="error">Autopilot could not finish: {error}</Alert>;
  if (!result?.tradePlan || !result?.thesis) return <Alert severity="info">Autopilot starts after a symbol is loaded.</Alert>;

  const plan = result.tradePlan;
  const thesis = result.thesis;
  const noTrade = plan.action === "No trade";
  const actionColor = plan.action === "No trade" ? "default" : plan.evidence?.historicallyValidated ? "success" : "warning";

  return (
    <Stack spacing={3}>
      {result.modelOrigin && (
        <Alert severity="info" icon={false}>
          Model: {result.modelOrigin === "ephemeral-ticker-model" ? "trained automatically for this ticker" : "saved universe model"}. Historical evidence is not a guarantee.
        </Alert>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1}>
        <Box>
          <Typography variant="overline">Current plan</Typography>
          <Typography variant="h5">{thesis.stance} · {thesis.conviction} conviction</Typography>
        </Box>
        <Chip label={plan.action} color={actionColor as any} sx={{ alignSelf: { xs: "flex-start", sm: "center" } }} />
      </Stack>

      {noTrade && plan.rejectionReasons?.length > 0 && (
        <Alert severity="warning">
          <Typography fontWeight={800}>No entry passed the evidence safeguards.</Typography>
          <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, mb: 0.25, mt: 0.75 }}>
            {plan.rejectionReasons.map((reason: string) => (
              <Typography component="li" variant="body2" key={reason}>{reason}</Typography>
            ))}
          </Stack>
        </Alert>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <MetricMini label={noTrade ? "Reference zone" : "Entry zone"} value={`${money(plan.entryZone.low, 2)}–${money(plan.entryZone.high, 2)}`} />
        <MetricMini label="Invalidation" value={money(plan.invalidation, 2)} color="error" />
        <MetricMini label="First target" value={money(plan.targets?.[0], 2)} color="success" />
        <MetricMini label="Risk / reward" value={plan.estimatedRiskReward ? `${fmt(plan.estimatedRiskReward, 2)}×` : "--"} />
      </Box>

      <Paper variant="outlined" sx={{ p: 2.5 }}>
        <Typography variant="subtitle2" fontWeight={800}>When to enter</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.75 }}>{plan.entryCondition}</Typography>
        <Divider sx={{ my: 2 }} />
        <Typography variant="subtitle2" fontWeight={800}>When to exit</Typography>
        <Stack component="ul" spacing={0.75} sx={{ pl: 2.5, mb: 0 }}>
          {plan.exitRules.map((rule: string) => <Typography component="li" variant="body2" key={rule}>{rule}</Typography>)}
        </Stack>
      </Paper>

      <Box>
        <Typography variant="overline">Rules-based thesis</Typography>
        <Typography variant="body1" fontWeight={650} sx={{ mt: 0.5 }}>{thesis.summary}</Typography>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 1.5 }}>
        <Paper variant="outlined" sx={{ p: 2, borderTop: "3px solid", borderTopColor: "success.main" }}>
          <Typography fontWeight={800}>Bull case</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{thesis.bullCase}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderTop: "3px solid", borderTopColor: "divider" }}>
          <Typography fontWeight={800}>Base case</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{thesis.baseCase}</Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, borderTop: "3px solid", borderTopColor: "error.main" }}>
          <Typography fontWeight={800}>Bear case</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{thesis.bearCase}</Typography>
        </Paper>
      </Box>

      <Box>
        <Typography variant="subtitle2" fontWeight={800}>Evidence used</Typography>
        <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, mb: 1 }}>
          {thesis.evidence.map((item: string) => <Typography component="li" variant="body2" color="text.secondary" key={item}>{item}</Typography>)}
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Ticker signal-screen history: {pct(plan.evidence.backtestHitRate)} hit rate, {fmt(plan.evidence.profitFactor, 2)} profit factor, across {plan.evidence.backtestSignals} signals. {thesis.methodology}
        </Typography>
      </Box>
      <Alert severity="warning">{plan.riskNote} {thesis.disclaimer}</Alert>
    </Stack>
  );
}
