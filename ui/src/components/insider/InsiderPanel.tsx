import React from "react";
import { Alert, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Box } from "@mui/material";
import { fmt, money, metricColor } from "../../lib/format";
import { MetricMini } from "../common/MetricMini";

interface InsiderPanelProps {
  activity?: any;
  error?: string;
}

export function InsiderPanel({ activity, error }: InsiderPanelProps) {
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (!activity) return <Alert severity="info">Insider activity will load after a ticker is selected.</Alert>;
  return (
    <Stack spacing={2}>
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 1.5 }}>
        <MetricMini label="Purchases" value={money(activity.purchaseValue)} color="success" />
        <MetricMini label="Sales" value={money(activity.saleValue)} color="error" />
        <MetricMini label="Net" value={money(activity.netValue)} color={metricColor(activity.netValue)} />
        <MetricMini label="Filings" value={String(activity.filingCount)} />
      </Box>
      <Typography variant="caption" color="text.secondary">
        {activity.source} · {activity.company} · latest {activity.latestFilingDate || "--"}
      </Typography>
      <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 360 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Insider</TableCell>
              <TableCell>Date</TableCell>
              <TableCell>Code</TableCell>
              <TableCell align="right">Shares</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">Value</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(activity.transactions || []).map((transaction: any, index: number) => (
              <TableRow key={`${transaction.accessionNumber}-${index}`}>
                <TableCell>
                  <Typography variant="body2" fontWeight={750}>{transaction.owner}</Typography>
                  <Typography variant="caption" color="text.secondary">{transaction.relationship?.officerTitle || "Insider"}</Typography>
                </TableCell>
                <TableCell>{transaction.date}</TableCell>
                <TableCell><Chip size="small" label={transaction.code || "--"} /></TableCell>
                <TableCell align="right">{transaction.shares != null ? fmt(transaction.shares, 0) : "--"}</TableCell>
                <TableCell align="right">{transaction.price != null ? money(transaction.price, 2) : "--"}</TableCell>
                <TableCell align="right">{transaction.value != null ? money(transaction.value) : "--"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
