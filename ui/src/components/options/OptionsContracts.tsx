import React from "react";
import { Alert, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import { OptionsChain } from "../../types";
import { fmt, pct } from "../../lib/format";

export function OptionsContracts({ options }: { options?: OptionsChain }) {
  if (!options?.available) {
    return <Alert severity="info">{options?.message || "No options chain available for this signal."}</Alert>;
  }
  const contracts = (options as any).contracts || options.quotes || [];
  return (
    <Stack spacing={2}>
      <Alert severity="success">
        Educational screen · {(options as any).side?.toUpperCase()} scenario · exp {(options as any).targetExpiration} · IV{" "}
        {pct((options as any).medianIv)} · chain as of {(options as any).asOf}
      </Alert>
      <Typography variant="caption" color="text.secondary">
        {(options as any).methodology} {(options as any).riskDisclosure}
      </Typography>
      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Type</TableCell>
              <TableCell align="right">Strike</TableCell>
              <TableCell align="right">Mid</TableCell>
              <TableCell align="right">IV</TableCell>
              <TableCell align="right">Delta</TableCell>
              <TableCell align="right">OI</TableCell>
              <TableCell align="right">Max loss</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {contracts.map((contract: any) => (
              <TableRow key={`${contract.symbol}-${contract.strike}`}>
                <TableCell>{String(contract.right || contract.type).toUpperCase()}</TableCell>
                <TableCell align="right">{fmt(contract.strike)}</TableCell>
                <TableCell align="right">{fmt(contract.mid)}</TableCell>
                <TableCell align="right">{pct(contract.impliedVol)}</TableCell>
                <TableCell align="right">{fmt(contract.delta, 2)}</TableCell>
                <TableCell align="right">{contract.openInterest != null ? Math.round(contract.openInterest) : "--"}</TableCell>
                <TableCell align="right">{fmt(contract.maxLoss)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
