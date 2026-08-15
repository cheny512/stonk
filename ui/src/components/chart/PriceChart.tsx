import React from "react";
import { Box, Chip, Stack, Typography } from "@mui/material";
import { EquityBar } from "../../types";
import { dateLabel, fmt, largeNumber, money, pct } from "../../lib/format";

interface ChartEvent {
  title: string;
  published?: string;
  publisher?: string;
}

interface PriceChartProps {
  rows: EquityBar[];
  range?: string;
  ticker?: string;
  provider?: string;
  asOf?: string;
  events?: ChartEvent[];
}

const RANGE_ROWS: Record<string, number> = {
  "5D": 5,
  "1M": 21,
  "3M": 63,
  "6M": 126,
  "1Y": 252,
  "5Y": 1260,
};

function rowsForRange(rows: EquityBar[], range: string): EquityBar[] {
  if (range === "ALL") return rows;
  if (range === "YTD") {
    const latestYear = rows.at(-1)?.date.slice(0, 4);
    return rows.filter((row) => row.date.startsWith(latestYear || ""));
  }
  return rows.slice(-(RANGE_ROWS[range] || RANGE_ROWS["1Y"]));
}

function fullDate(value: string): string {
  const parsed = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function PriceChart({ rows, range = "1Y", ticker, provider, asOf, events = [] }: PriceChartProps) {
  const [hoverIndex, setHoverIndex] = React.useState<number | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);
  const gradientId = `price-area-${React.useId().replace(/:/g, "")}`;
  const width = 960;
  const height = 420;
  const padLeft = 28;
  const padRight = 72;
  const priceTop = 24;
  const priceBottom = 300;
  const volumeTop = 324;
  const volumeBottom = 374;
  const sliceData = React.useMemo(() => rowsForRange(rows || [], range), [rows, range]);

  React.useEffect(() => setHoverIndex(null), [range, rows]);

  if (sliceData.length < 2) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", height: 320, color: "text.secondary", border: "1px dashed", borderColor: "divider", borderRadius: 3 }}>
        {sliceData.length === 1 ? `Last close: $${fmt(sliceData[0].close)}` : "No price history is available."}
      </Box>
    );
  }

  const closes = sliceData.map((row) => row.close);
  const volumes = sliceData.map((row) => row.volume || 0);
  const rawMin = Math.min(...sliceData.map((row) => row.low || row.close));
  const rawMax = Math.max(...sliceData.map((row) => row.high || row.close));
  const rawSpan = rawMax - rawMin || Math.max(rawMax * 0.01, 0.01);
  const min = Math.max(0, rawMin - rawSpan * 0.06);
  const max = rawMax + rawSpan * 0.06;
  const span = max - min;
  const first = sliceData[0];
  const last = sliceData.at(-1)!;
  const activeIndex = hoverIndex ?? sliceData.length - 1;
  const activeRow = sliceData[activeIndex];
  const activeChange = activeRow.close / first.close - 1;
  const totalChange = last.close / first.close - 1;
  const positive = totalChange >= 0;
  const strokeColor = positive ? "#168052" : "#b7413b";
  const xFor = (index: number) => padLeft + (index / Math.max(1, sliceData.length - 1)) * (width - padLeft - padRight);
  const yFor = (price: number) => priceTop + (1 - (price - min) / span) * (priceBottom - priceTop);
  const points = sliceData.map((row, index) => `${xFor(index).toFixed(1)},${yFor(row.close).toFixed(1)}`).join(" ");
  const areaPoints = `${padLeft},${priceBottom} ${points} ${width - padRight},${priceBottom}`;
  const maxVolume = Math.max(...volumes, 1);
  const eventMarkers = events
    .filter((event) => event.published && event.published >= first.date && event.published <= last.date)
    .slice(0, 6)
    .map((event) => {
      const timestamp = new Date(`${event.published!.slice(0, 10)}T12:00:00`).getTime();
      let nearest = 0;
      let distance = Number.POSITIVE_INFINITY;
      sliceData.forEach((row, index) => {
        const nextDistance = Math.abs(new Date(`${row.date.slice(0, 10)}T12:00:00`).getTime() - timestamp);
        if (nextDistance < distance) {
          nearest = index;
          distance = nextDistance;
        }
      });
      return { event, index: nearest };
    });

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    const rawIndex = Math.round(((svgX - padLeft) / (width - padLeft - padRight)) * (sliceData.length - 1));
    setHoverIndex(Math.max(0, Math.min(sliceData.length - 1, rawIndex)));
  };

  return (
    <Box sx={{ overflow: "hidden", bgcolor: "#fff" }}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2} sx={{ p: { xs: 2, sm: 3 }, pb: 0 }}>
        <Box>
          <Typography variant="h5" sx={{ mb: 1 }}>{ticker || "Price"}</Typography>
          <Typography variant="h2" sx={{ fontWeight: 800, letterSpacing: "-0.05em", lineHeight: 1 }}>${fmt(activeRow.close)}</Typography>
          <Typography color={activeChange >= 0 ? "success.main" : "error.main"} fontWeight={800}>
            {activeChange >= 0 ? "+" : ""}{money(activeRow.close - first.close, 2)} ({pct(activeChange, 2)})
            <Box component="span" sx={{ color: "text.secondary", fontWeight: 500 }}> · {hoverIndex === null ? range : fullDate(activeRow.date)}</Box>
          </Typography>
        </Box>
        <Stack alignItems={{ xs: "flex-start", md: "flex-end" }} spacing={1}>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" label={`O $${fmt(activeRow.open)}`} sx={{ bgcolor: "#f4f6f4" }} />
            <Chip size="small" label={`H $${fmt(activeRow.high)}`} sx={{ bgcolor: "#f4f6f4" }} />
            <Chip size="small" label={`L $${fmt(activeRow.low)}`} sx={{ bgcolor: "#f4f6f4" }} />
            <Chip size="small" label={`Vol ${largeNumber(activeRow.volume)}`} sx={{ bgcolor: "#f4f6f4" }} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            {provider ? `Source: ${provider} · ` : ""}Daily bars through {fullDate(asOf || last.date)}
          </Typography>
        </Stack>
      </Stack>

      <svg
        ref={svgRef}
        className="chart-svg enhanced"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${ticker || "Stock"} ${range} adjusted closing-price chart`}
        tabIndex={0}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const next = (hoverIndex ?? sliceData.length - 1) + (event.key === "ArrowRight" ? 1 : -1);
          setHoverIndex(Math.max(0, Math.min(sliceData.length - 1, next)));
        }}
        style={{ touchAction: "none", display: "block", width: "100%" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((line) => {
          const y = priceTop + ((priceBottom - priceTop) / 4) * line;
          const value = max - (span / 4) * line;
          return (
            <g key={line}>
              <line x1={padLeft} x2={width - padRight} y1={y} y2={y} stroke="#dfe4df" strokeDasharray="3 5" />
              <text x={width - padRight + 10} y={y + 4} className="chart-label axis" style={{ fontSize: 11, fontWeight: 650 }}>${fmt(value)}</text>
            </g>
          );
        })}
        {sliceData.map((row, index) => {
          const barHeight = ((row.volume || 0) / maxVolume) * (volumeBottom - volumeTop);
          const barWidth = Math.max(1, Math.min(5, (width - padLeft - padRight) / sliceData.length - 1));
          return (
            <rect key={`${row.date}-${index}`} x={xFor(index) - barWidth / 2} y={volumeBottom - barHeight} width={barWidth} height={barHeight}
              fill={index > 0 && row.close < sliceData[index - 1].close ? "#d9a7a3" : "#9ec8b8"} opacity={hoverIndex === null || hoverIndex === index ? 0.72 : 0.22} />
          );
        })}
        <polyline points={areaPoints} fill={`url(#${gradientId})`} stroke="none" />
        <polyline points={points} fill="none" stroke={strokeColor} strokeWidth="2.6" strokeLinejoin="round" strokeLinecap="round" />
        {eventMarkers.map(({ event, index }, markerIndex) => (
          <g key={`${event.title}-${markerIndex}`}>
            <line x1={xFor(index)} x2={xFor(index)} y1={yFor(sliceData[index].close) + 9} y2={priceBottom} stroke="#aa7b16" strokeOpacity="0.35" strokeDasharray="2 3" />
            <circle cx={xFor(index)} cy={yFor(sliceData[index].close)} r="6" fill="#aa7b16" stroke="#fff" strokeWidth="2">
              <title>{`${event.published}: ${event.title}`}</title>
            </circle>
          </g>
        ))}
        {hoverIndex === null ? (
          <>
            <line x1={padLeft} x2={width - padRight} y1={yFor(last.close)} y2={yFor(last.close)} stroke={strokeColor} strokeWidth="1" strokeDasharray="4 3" />
            <circle cx={xFor(sliceData.length - 1)} cy={yFor(last.close)} r="5" fill={strokeColor} stroke="#fff" strokeWidth="2" />
          </>
        ) : (
          <g>
            <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={priceTop} y2={volumeBottom} stroke="#68716c" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx={xFor(hoverIndex)} cy={yFor(activeRow.close)} r="6" fill={strokeColor} stroke="#fff" strokeWidth="3" />
          </g>
        )}
        <text x={padLeft} y={height - 18} className="chart-label date" style={{ fontWeight: 650 }}>{dateLabel(first.date)}</text>
        <text x={width / 2} y={height - 18} className="chart-label date" textAnchor="middle" style={{ fontWeight: 650 }}>{dateLabel(sliceData[Math.floor(sliceData.length / 2)].date)}</text>
        <text x={width - padRight} y={height - 18} className="chart-label date" textAnchor="end" style={{ fontWeight: 650 }}>{dateLabel(last.date)}</text>
      </svg>
      <Stack direction={{ xs: "column", sm: "row" }} justifyContent="space-between" spacing={1} sx={{ px: 3, pb: 2 }}>
        <Typography variant="caption" color="text.secondary">Range high ${fmt(rawMax)} · Range low ${fmt(rawMin)} · {sliceData.length} sessions</Typography>
        <Typography variant="caption" color="text.secondary">
          Hover, touch, or use arrow keys to inspect{eventMarkers.length ? " · Gold dots mark recent news" : ""}
        </Typography>
      </Stack>
    </Box>
  );
}
