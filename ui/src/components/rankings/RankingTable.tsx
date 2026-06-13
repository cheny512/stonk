import React from "react";
import { Chip, FormControlLabel, Paper, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { ModelSettings } from "../../types";
import { fmt } from "../../lib/format";

interface RankingTableProps {
  rankings: any[];
  settings: ModelSettings;
  onToggle: (key: string, enabled: boolean) => void;
  onWeight: (key: string, weight: number) => void;
}

export function RankingTable({ rankings, settings, onToggle, onWeight }: RankingTableProps) {
  if (!rankings.length) return null;
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Indicator</TableCell>
            <TableCell>Group</TableCell>
            <TableCell align="right">Learned</TableCell>
            <TableCell align="right">Weight</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rankings.map((indicator, index) => {
            const setting = settings[indicator.key] || { enabled: true, weight: 0 };
            return (
              <TableRow key={indicator.key}>
                <TableCell>
                  <FormControlLabel
                    control={<Switch checked={Boolean(setting.enabled)} onChange={(event) => onToggle(indicator.key, event.target.checked)} />}
                    label={`${index + 1}. ${indicator.label}`}
                  />
                </TableCell>
                <TableCell><Chip size="small" label={indicator.group} /></TableCell>
                <TableCell align="right">
                  <Typography color={indicator.correlation >= 0 ? "success.main" : "error.main"} fontWeight={800}>
                    {indicator.learnedWeight != null ? fmt(indicator.learnedWeight, 2) : fmt(indicator.correlation, 3)}
                  </Typography>
                </TableCell>
                <TableCell align="right" sx={{ width: 110 }}>
                  <TextField
                    size="small"
                    type="number"
                    inputProps={{ min: -3, max: 3, step: 0.05 }}
                    value={setting.weight ?? 0}
                    onChange={(event) => onWeight(indicator.key, Number(event.target.value))}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
