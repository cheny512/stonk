import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { EquityBar } from "../../types";
import { fmt, money, largeNumber, dateLabel, pct } from "../../lib/format";

interface PriceChartProps {
  rows: EquityBar[];
  range?: string;
}

export function PriceChart({ rows, range = "1Y" }: PriceChartProps) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const width = 960;
  const height = 400;
  const padX = 64;
  const padTop = 32;
  const padBottom = 48;
  const sliceData = React.useMemo(() => {
    if (!rows?.length) return [];
    const countMap: Record<string, number> = { "5D": 5, "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "5Y": 1260, ALL: rows.length };
    return rows.slice(-(countMap[range] || 252));
  }, [rows, range]);

  if (sliceData.length < 2) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", height: 320, color: "text.secondary", border: "1px dashed", borderColor: "divider", borderRadius: 3 }}>
        {sliceData.length === 1 ? `Last close: $${fmt(sliceData[0].close)}` : "No chart data."}
      </Box>
    );
  }

  const closes = sliceData.map((row) => row.close);
  const volumes = sliceData.map((row) => row.volume || 0);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 0.01;
  const first = sliceData[0];
  const last = sliceData.at(-1)!;
  const activeIndex = hoverIndex !== null ? hoverIndex : sliceData.length - 1;
  const activeRow = sliceData[activeIndex];
  const activeChange = activeRow.close / first.close - 1;
  
  const totalChange = last.close / first.close - 1;
  const positive = totalChange >= 0;
  const strokeColor = positive ? "#168052" : "#b7413b";
  
  const plotHeight = height - padTop - padBottom;
  const xFor = (index: number) => padX + (index / Math.max(1, sliceData.length - 1)) * (width - padX * 2);
  const yFor = (close: number) => padTop + (1 - (close - min) / span) * plotHeight;
  const points = sliceData
    .map((row, index) => `${xFor(index).toFixed(1)},${yFor(row.close).toFixed(1)}`)
    .join(" ");
  const areaPoints = `${padX},${height - padBottom} ${points} ${width - padX},${height - padBottom}`;
  const lastY = yFor(last.close);
  const highIndex = closes.indexOf(max);
  const lowIndex = closes.indexOf(min);
  const maxVolume = Math.max(...volumes, 1);
  const volumeTop = height - 100;
  const volumeHeight = 44;
  const labelRows = [
    { label: "High", value: max, x: xFor(highIndex), y: yFor(max) },
    { label: "Low", value: min, x: xFor(lowIndex), y: yFor(min) },
  ];

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const svgX = (x / rect.width) * width;
    const rawIndex = Math.round(((svgX - padX) / (width - padX * 2)) * (sliceData.length - 1));
    setHoverIndex(Math.max(0, Math.min(sliceData.length - 1, rawIndex)));
  };

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 3, mt: 2, overflow: "hidden", bgcolor: "#fff", position: 'relative' }}>
      <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between" spacing={1.5} sx={{ p: 3, pb: 0 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 900 }}>${fmt(activeRow.close)}</Typography>
          <Typography color={activeChange >= 0 ? "success.main" : "error.main"} fontWeight={700}>
            {activeChange >= 0 ? "+" : ""}{money(activeRow.close - first.close, 2)} ({pct(activeChange)}) · {hoverIndex !== null ? dateLabel(activeRow.date) : range}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Chip size="small" variant="outlined" label={`Open $${fmt(activeRow.open ?? activeRow.close)}`} />
          <Chip size="small" variant="outlined" label={`High $${fmt(max)}`} />
          <Chip size="small" variant="outlined" label={`Low $${fmt(min)}`} />
          <Chip size="small" variant="outlined" label={`Vol ${largeNumber(activeRow.volume)}`} />
        </Stack>
      </Stack>
      <svg 
        ref={svgRef}
        className="chart-svg enhanced" 
        viewBox={`0 0 ${width} ${height}`} 
        role="img" 
        aria-label="Price chart"
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        style={{ touchAction: "none" }}
      >
        <defs>
          <linearGradient id={`priceArea-${positive ? "up" : "down"}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.16" />
            <stop offset="90%" stopColor={strokeColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = padTop + (plotHeight / 3) * line;
          const value = max - (span / 3) * line;
          return (
            <g key={line}>
              <line x1={padX} x2={width - padX} y1={y} y2={y} className="grid-line" strokeDasharray="4 4" strokeOpacity={0.6} />
              <text x={width - padX + 8} y={y + 4} className="chart-label axis" style={{ fontSize: '10px', fontWeight: 600 }}>${fmt(value)}</text>
            </g>
          );
        })}
        {sliceData.map((row, index) => {
          const barHeight = ((row.volume || 0) / maxVolume) * volumeHeight;
          const x = xFor(index);
          return (
            <rect
              key={`${row.date}-${index}`}
              x={x - 1.5}
              y={volumeTop + volumeHeight - barHeight}
              width="3"
              height={barHeight}
              fill={index > 0 && row.close < sliceData[index - 1].close ? "#d9a7a3" : "#9ec8b8"}
              opacity={hoverIndex === null || hoverIndex === index ? "0.5" : "0.15"}
            />
          );
        })}
        <polyline points={areaPoints} fill={`url(#priceArea-${positive ? "up" : "down"})`} stroke="none" />
        <polyline points={points} fill="none" className="price-line" style={{ stroke: strokeColor, strokeWidth: 2.5 }} />
        
        {hoverIndex === null && (
          <>
            <circle cx={width - padX} cy={lastY} r="5" fill={strokeColor} stroke="#fff" strokeWidth={2} />
            <line x1={padX} x2={width - padX} y1={lastY} y2={lastY} className="current-price-line" style={{ stroke: strokeColor, strokeWidth: 1.5 }} strokeDasharray="4 2" />
            <text x={width - padX} y={lastY - 12} className="chart-label current" textAnchor="end" style={{ fontWeight: 800, fontSize: '12px' }}>
              ${fmt(last.close)}
            </text>
          </>
        )}

        {hoverIndex !== null && (
          <g className="crosshair">
            <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={padTop} y2={height - padBottom} stroke="#bbb" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx={xFor(hoverIndex)} cy={yFor(activeRow.close)} r="6" fill={strokeColor} stroke="#fff" strokeWidth="3" />
          </g>
        )}

        {labelRows.map((item) => (
          <g key={item.label} style={{ opacity: hoverIndex === null ? 1 : 0.2, transition: "opacity 0.2s" }}>
            <circle cx={item.x} cy={item.y} r="3" fill="#18201f" opacity="0.3" />
            <text x={item.x} y={item.y - 12} className="chart-label marker" textAnchor={item.x > width * 0.72 ? "end" : "start"} style={{ fontSize: '11px' }}>
              {item.label} ${fmt(item.value)}
            </text>
          </g>
        ))}
        
        <text x={padX} y={height - 16} className="chart-label date" style={{ fontWeight: 600 }}>{dateLabel(sliceData[0].date)}</text>
        <text x={width / 2} y={height - 16} className="chart-label date" textAnchor="middle" style={{ fontWeight: 600 }}>
          {dateLabel(sliceData[Math.floor(sliceData.length / 2)].date)}
        </text>
        <text x={width - padX} y={height - 16} className="chart-label date" textAnchor="end" style={{ fontWeight: 600 }}>{dateLabel(last.date)}</text>
      </svg>
    </Box>
  );
}
