import React from "react";
import { Alert, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from "@mui/material";
import { OptionsChain } from "../../types";
import { fmt, pct } from "../../lib/format";

export function OptionsContracts({ options }: { options?: OptionsChain }) {
  if (!options?.available) {
    return <Alert severity="info">{options?.message || "No options chain available for this signal."}</Alert>;
  }
  return (
    <Stack spacing={2}>
      <Alert severity="success">
        {(options as any).side?.toUpperCase()} bias · exp {(options as any).targetExpiration} · IV{" "}
        {pct((options as any).medianIv)} · {(options as any).setup?.setup}
      </Alert>
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
            </TableRow>
          </TableHead>
          <TableBody>
            {(options.quotes || []).map((contract) => (
              <TableRow key={`${contract.symbol}-${contract.strike}`}>
                <TableCell>{contract.right.toUpperCase()}</TableCell>
                <TableCell align="right">{fmt(contract.strike)}</TableCell>
                <TableCell align="right">{fmt(contract.mid)}</TableCell>
                <TableCell align="right">{pct(contract.impliedVol)}</TableCell>
                <TableCell align="right">{fmt(contract.delta, 2)}</TableCell>
                <TableCell align="right">{contract.volume != null ? Math.round(contract.volume) : "--"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}
