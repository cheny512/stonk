import React from "react";
import { Box } from "@mui/material";
import { BacktestTrade } from "../../types";

interface EquityCurveProps {
  trades?: BacktestTrade[];
}

export function EquityCurve({ trades }: EquityCurveProps) {
  const width = 900;
  const height = 180;
  const pad = 28;
  let cumulative = 0;
  const data = (trades || []).map((trade) => {
    cumulative += trade.pnl;
    return cumulative;
  });
  const curve = data.length ? data : [0];
  const min = Math.min(...curve, 0);
  const max = Math.max(...curve, 0);
  const points = curve
    .map((value, index) => {
      const x = pad + (index / Math.max(1, curve.length - 1)) * (width - pad * 2);
      const y = height - pad - ((value - min) / Math.max(0.0001, max - min)) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, mt: 2, overflow: "hidden", bgcolor: "#fafbfc" }}>
      <svg className="mini-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Backtest equity curve">
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} className="grid-line" strokeOpacity={0.5} />
        <polyline points={points} fill="none" className="equity-line" strokeWidth={2} />
      </svg>
    </Box>
  );
}
