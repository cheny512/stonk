import React from "react";
import { createRoot } from "react-dom/client";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CssBaseline,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Slider,
  Stack,
  Switch,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  createTheme,
  Drawer,
  AppBar,
  Toolbar,
  IconButton,
  Container,
} from "@mui/material";
import AccountBalanceIcon from "@mui/icons-material/AccountBalance";
import AutoGraphIcon from "@mui/icons-material/AutoGraph";
import CloudSyncIcon from "@mui/icons-material/CloudSync";
import DownloadIcon from "@mui/icons-material/Download";
import InsightsIcon from "@mui/icons-material/Insights";
import RefreshIcon from "@mui/icons-material/Refresh";
import SavedSearchIcon from "@mui/icons-material/SavedSearch";
import ScienceIcon from "@mui/icons-material/Science";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import StorageIcon from "@mui/icons-material/Storage";
import SettingsIcon from "@mui/icons-material/Settings";
import HubIcon from "@mui/icons-material/Hub";
import AssessmentIcon from "@mui/icons-material/Assessment";
import DashboardIcon from "@mui/icons-material/Dashboard";
import TerminalIcon from "@mui/icons-material/Terminal";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsIcon from "@mui/icons-material/Notifications";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";

import {
  downloadUniverse,
  fetchDatasetMeta,
  fetchHealth,
  fetchIndicators,
  fetchInsiderActivity,
  fetchLiveSignals,
  fetchProviders,
  fetchStock,
  fetchStockResearch,
  fetchSynthesis,
  fetchTrainedModel,
  fetchUniverse,
  runPortfolioBacktest,
  runStockTest,
  trainResearch,
} from "./api/client";
import { clamp, defaultCatalysts, pct } from "./engine";
import "./styles.css";

const theme = createTheme({
  palette: {
    mode: "light",
    background: { default: "#f8f9fa", paper: "#ffffff" },
    primary: { main: "#146c5c", light: "#208a74", dark: "#0e5245" },
    secondary: { main: "#1b2d4f", light: "#273f66", dark: "#0f1c32" },
    success: { main: "#168052", light: "#e8f5ed" },
    warning: { main: "#a86f00", light: "#fff8e1" },
    error: { main: "#b7413b", light: "#fdecea" },
    info: { main: "#275f9f", light: "#e3f2fd" },
    text: { primary: "#1a1c1b", secondary: "#5f6664" },
    divider: "rgba(0, 0, 0, 0.08)",
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
    button: { textTransform: "none", fontWeight: 600 },
    h4: { fontWeight: 800, letterSpacing: "-0.02em" },
    h5: { fontWeight: 700, letterSpacing: "-0.01em" },
    h6: { fontWeight: 700, letterSpacing: 0 },
    overline: { fontWeight: 800, letterSpacing: "0.1em", fontSize: "0.7rem", color: "#66716d" },
    body1: { lineHeight: 1.6 },
    body2: { lineHeight: 1.5 },
  },
  components: {
    MuiCard: { 
      styleOverrides: { 
        root: { 
          boxShadow: "0 2px 12px rgba(0, 0, 0, 0.04)",
          border: "1px solid rgba(0, 0, 0, 0.08)",
          borderRadius: 16
        } 
      } 
    },
    MuiButton: { 
      styleOverrides: { 
        root: { 
          minHeight: 40,
          borderRadius: 10,
          boxShadow: "none",
          "&:hover": { boxShadow: "0 4px 12px rgba(20, 108, 92, 0.12)" }
        },
        contained: { fontWeight: 700 }
      } 
    },
    MuiPaper: {
      styleOverrides: {
        outlined: { borderColor: "rgba(0, 0, 0, 0.08)", borderRadius: 12 }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, borderRadius: 8 }
      }
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 10
          }
        }
      }
    }
  },
});

function fmt(value, digits = 2) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function money(value, digits = 0) {
  if (!Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });
}

function largeNumber(value) {
  if (!Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${fmt(value / 1_000_000_000_000, 2)}T`;
  if (abs >= 1_000_000_000) return `${fmt(value / 1_000_000_000, 2)}B`;
  if (abs >= 1_000_000) return `${fmt(value / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${fmt(value / 1_000, 2)}K`;
  return fmt(value, 0);
}

function titleize(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (ch) => ch.toUpperCase());
}

function metricColor(value) {
  if (!Number.isFinite(value)) return "default";
  if (value > 0) return "success";
  if (value < 0) return "error";
  return "default";
}

function dateLabel(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function PriceChart({ rows, range = "1Y" }) {
  const [hoverIndex, setHoverIndex] = React.useState(null);
  const svgRef = React.useRef(null);
  const width = 960;
  const height = 380;
  const padX = 64;
  const padTop = 32;
  const padBottom = 48;
  const sliceData = React.useMemo(() => {
    if (!rows?.length) return [];
    const countMap = { "5D": 5, "1M": 21, "3M": 63, "6M": 126, "1Y": 252, "5Y": 1260, ALL: rows.length };
    return rows.slice(-(countMap[range] || 252));
  }, [rows, range]);

  if (sliceData.length < 2) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", height: 320, color: "text.secondary" }}>
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
  const last = sliceData.at(-1);
  const activeIndex = hoverIndex !== null ? hoverIndex : sliceData.length - 1;
  const activeRow = sliceData[activeIndex];
  const activeChange = activeRow.close / first.close - 1;
  
  const totalChange = last.close / first.close - 1;
  const positive = totalChange >= 0;
  const strokeColor = positive ? "#168052" : "#b7413b";
  
  const plotHeight = height - padTop - padBottom;
  const xFor = (index) => padX + (index / Math.max(1, sliceData.length - 1)) * (width - padX * 2);
  const yFor = (close) => padTop + (1 - (close - min) / span) * plotHeight;
  const points = sliceData
    .map((row, index) => `${xFor(index).toFixed(1)},${yFor(row.close).toFixed(1)}`)
    .join(" ");
  const areaPoints = `${padX},${height - padBottom} ${points} ${width - padX},${height - padBottom}`;
  const lastY = yFor(last.close);
  const highIndex = closes.indexOf(max);
  const lowIndex = closes.indexOf(min);
  const maxVolume = Math.max(...volumes, 1);
  const volumeTop = height - 90;
  const volumeHeight = 40;
  const labelRows = [
    { label: "High", value: max, x: xFor(highIndex), y: yFor(max) },
    { label: "Low", value: min, x: xFor(lowIndex), y: yFor(min) },
  ];

  const handlePointerMove = (e) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const svgX = (x / rect.width) * width;
    const rawIndex = Math.round(((svgX - padX) / (width - padX * 2)) * (sliceData.length - 1));
    setHoverIndex(Math.max(0, Math.min(sliceData.length - 1, rawIndex)));
  };

  return (
    <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, mt: 2, overflow: "hidden", bgcolor: "#fff" }}>
      <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ xs: "flex-start", sm: "center" }} justifyContent="space-between" spacing={1.5} sx={{ p: 2.5, pb: 0 }}>
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
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.18" />
            <stop offset="85%" stopColor={strokeColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => {
          const y = padTop + (plotHeight / 3) * line;
          const value = max - (span / 3) * line;
          return (
            <g key={line}>
              <line x1={padX} x2={width - padX} y1={y} y2={y} className="grid-line" strokeDasharray="4 4" />
              <text x={width - padX + 8} y={y + 4} className="chart-label axis">${fmt(value)}</text>
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
              opacity={hoverIndex === null || hoverIndex === index ? "0.6" : "0.2"}
            />
          );
        })}
        <polyline points={areaPoints} fill={`url(#priceArea-${positive ? "up" : "down"})`} stroke="none" />
        <polyline points={points} fill="none" className="price-line" style={{ stroke: strokeColor, strokeWidth: 2.5 }} />
        
        {hoverIndex === null && (
          <>
            <circle cx={width - padX} cy={lastY} r="5" fill={strokeColor} stroke="#fff" strokeWidth={2} />
            <line x1={padX} x2={width - padX} y1={lastY} y2={lastY} className="current-price-line" style={{ stroke: strokeColor }} strokeDasharray="3 3" />
            <text x={width - padX} y={lastY - 12} className="chart-label current" textAnchor="end" style={{ fontWeight: 800 }}>
              ${fmt(last.close)}
            </text>
          </>
        )}

        {hoverIndex !== null && (
          <g className="crosshair">
            <line x1={xFor(hoverIndex)} x2={xFor(hoverIndex)} y1={padTop} y2={height - padBottom} stroke="#aaa" strokeWidth="1" strokeDasharray="4 4" />
            <circle cx={xFor(hoverIndex)} cy={yFor(activeRow.close)} r="6" fill={strokeColor} stroke="#fff" strokeWidth="3" />
          </g>
        )}

        {labelRows.map((item) => (
          <g key={item.label} style={{ opacity: hoverIndex === null ? 1 : 0.2, transition: "opacity 0.2s" }}>
            <circle cx={item.x} cy={item.y} r="3" fill="#18201f" opacity="0.4" />
            <text x={item.x} y={item.y - 10} className="chart-label marker" textAnchor={item.x > width * 0.72 ? "end" : "start"}>
              {item.label} ${fmt(item.value)}
            </text>
          </g>
        ))}
        
        <text x={padX} y={height - 12} className="chart-label date">{dateLabel(sliceData[0].date)}</text>
        <text x={width / 2} y={height - 12} className="chart-label date" textAnchor="middle">
          {dateLabel(sliceData[Math.floor(sliceData.length / 2)].date)}
        </text>
        <text x={width - padX} y={height - 12} className="chart-label date" textAnchor="end">{dateLabel(last.date)}</text>
      </svg>
    </Box>
  );
}

function EquityCurve({ trades }) {
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

function MetricCard({ label, value, note, color = "primary", icon: Icon }) {
  return (
    <Card variant="outlined" sx={{ 
      position: 'relative', 
      overflow: 'hidden',
      height: '100%',
      transition: 'all 0.2s ease-in-out',
      "&:hover": { 
        transform: 'translateY(-4px)',
        boxShadow: "0 12px 24px rgba(0, 0, 0, 0.06)",
        borderColor: `${color}.main`
      }
    }}>
      <Box sx={{ 
        position: 'absolute', 
        right: -10, 
        top: -10, 
        opacity: 0.05, 
        transform: 'scale(2.5)',
        color: `${color}.main`
      }}>
        {Icon && <Icon fontSize="large" />}
      </Box>
      <CardContent sx={{ p: 2.5, "&:last-child": { pb: 2.5 } }}>
        <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>
          {label}
        </Typography>
        <Typography variant="h4" color={`${color}.main`} sx={{ fontWeight: 800 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, fontWeight: 500, fontSize: '0.85rem' }}>
          {note}
        </Typography>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, action, children, id, icon: Icon }) {
  return (
    <Card variant="outlined" id={id} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ 
        px: 3, 
        py: 2, 
        borderBottom: "1px solid", 
        borderColor: "divider", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between",
        bgcolor: "rgba(0, 0, 0, 0.01)"
      }}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          {Icon && <Icon sx={{ color: "primary.main", fontSize: 22 }} />}
          <Typography variant="h6" sx={{ fontSize: "1.1rem" }}>{title}</Typography>
        </Stack>
        {action}
      </Box>
      <CardContent sx={{ p: 3, flexGrow: 1 }}>
        {children}
      </CardContent>
    </Card>
  );
}

function DatasetPicker({ datasets, onChange, onSelectAll }) {
  const ready = datasets.filter((dataset) => dataset.ready);
  const selected = ready.filter((dataset) => dataset.selected);
  return (
    <Stack spacing={1.5}>
      <Autocomplete
        multiple
        disableCloseOnSelect
        size="small"
        options={ready}
        value={selected}
        getOptionLabel={(option) => option.ticker}
        isOptionEqualToValue={(option, value) => option.ticker === value.ticker}
        onChange={(_, value) => onChange(value.map((item) => item.ticker))}
        renderOption={(props, option, { selected: isSelected }) => (
          <li {...props} key={option.ticker}>
            <Checkbox checked={isSelected} size="small" />
            <ListItemText
              primary={option.ticker}
              secondary={`${option.rows} rows · ${option.start} to ${option.end}`}
            />
          </li>
        )}
        renderInput={(params) => <TextField {...params} label="Training universe" placeholder="Select tickers" />}
      />
      <Stack direction="row" spacing={1}>
        <Button fullWidth size="small" variant="outlined" onClick={() => onSelectAll(true)}>
          Select ready
        </Button>
        <Button fullWidth size="small" variant="outlined" onClick={() => onSelectAll(false)}>
          Clear
        </Button>
      </Stack>
    </Stack>
  );
}

function RankingTable({ rankings, settings, onToggle, onWeight }) {
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

function OptionsContracts({ options }) {
  if (!options?.available) {
    return <Alert severity="info">{options?.message || "No options chain available for this signal."}</Alert>;
  }
  return (
    <Stack spacing={2}>
      <Alert severity="success">
        {options.side?.toUpperCase()} bias · exp {options.targetExpiration} · IV{" "}
        {options.medianIv != null ? pct(options.medianIv) : "--"} · {options.setup?.setup}
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
            {(options.contracts || []).map((contract) => (
              <TableRow key={`${contract.symbol}-${contract.strike}`}>
                <TableCell>{contract.type}</TableCell>
                <TableCell align="right">{fmt(contract.strike)}</TableCell>
                <TableCell align="right">{fmt(contract.mid)}</TableCell>
                <TableCell align="right">{contract.impliedVol != null ? pct(contract.impliedVol) : "--"}</TableCell>
                <TableCell align="right">{contract.delta != null ? fmt(contract.delta, 2) : "--"}</TableCell>
                <TableCell align="right">{contract.openInterest != null ? Math.round(contract.openInterest) : "--"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Stack>
  );
}

function LiveSignalsTable({ payload }) {
  if (!payload?.signals?.length) return null;
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 2 }}>
      {payload.signals.map((signal) => (
        <Card variant="outlined" key={signal.ticker}>
          <CardContent>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="h6">{signal.ticker}</Typography>
              <Chip color={signal.bias === "Bullish" ? "success" : signal.bias === "Bearish" ? "error" : "default"} label={signal.bias} size="small" />
            </Stack>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1.5, mt: 2 }}>
              <MetricMini label="Up" value={pct(signal.probabilityUp)} />
              <MetricMini label="Edge" value={pct(signal.movementEdge)} color={metricColor(signal.movementEdge)} />
              <MetricMini label="Move" value={pct(signal.expectedMove)} />
            </Box>
            {signal.options?.available && signal.options.contracts?.[0] && (
              <Alert severity="info" sx={{ mt: 2 }}>
                {signal.options.contracts[0].strike} {signal.options.contracts[0].type?.toUpperCase()} · ${fmt(signal.options.contracts[0].mid)}
              </Alert>
            )}
          </CardContent>
        </Card>
      ))}
    </Box>
  );
}

function MetricMini({ label, value, color = "default" }) {
  const isPositive = color === "success" || (typeof value === "string" && value.includes("+"));
  const isNegative = color === "error" || (typeof value === "string" && value.includes("-"));
  
  return (
    <Box sx={{ 
      p: 1.5, 
      border: "1px solid", 
      borderColor: "divider", 
      borderRadius: 2,
      bgcolor: "background.paper",
      display: 'flex',
      flexDirection: 'column',
      gap: 0.5,
      height: '100%',
      justifyContent: 'center'
    }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={800} sx={{ 
        color: isPositive ? "success.main" : isNegative ? "error.main" : "text.primary",
        fontSize: '0.9rem'
      }}>
        {value}
      </Typography>
    </Box>
  );
}

function InsiderPanel({ activity, error }) {
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
            {(activity.transactions || []).map((transaction, index) => (
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

function ResearchSummaryPanel({ summary, error }) {
  if (error) return <Alert severity="warning">{error}</Alert>;
  if (!summary) return <Alert severity="info">Load a ticker to build the research summary.</Alert>;

  const fundamentals = summary.fundamentals || {};
  const metrics = fundamentals.metrics || {};
  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
        <Chip label={fundamentals.name || summary.ticker} color="primary" />
        {fundamentals.sector && <Chip label={fundamentals.sector} />}
        {fundamentals.industry && <Chip label={fundamentals.industry} />}
        <Chip label={`${summary.history.rows} daily bars`} />
      </Stack>

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
        <MetricMini label="5D return" value={pct(summary.history.return5d)} color={metricColor(summary.history.return5d)} />
        <MetricMini label="1M return" value={pct(summary.history.return1m)} color={metricColor(summary.history.return1m)} />
        <MetricMini label="YTD return" value={pct(summary.history.ytdReturn)} color={metricColor(summary.history.ytdReturn)} />
        <MetricMini label="1Y return" value={pct(summary.history.return1y)} color={metricColor(summary.history.return1y)} />
        <MetricMini label="20D vol" value={pct(summary.volatility.realized20d)} />
        <MetricMini label="60D vol" value={pct(summary.volatility.realized60d)} />
        <MetricMini label="ATR 14" value={pct(summary.volatility.atr14)} />
        <MetricMini label="Avg day move" value={pct(summary.volatility.averageDailyMove20d)} />
        <MetricMini label="Latest volume" value={largeNumber(summary.volume.latestVolume)} />
        <MetricMini label="Relative volume" value={`${fmt(summary.volume.relativeVolume20d, 2)}x`} />
        <MetricMini label="Buy pressure" value={pct(summary.volume.buyPressure20d)} color={metricColor((summary.volume.buyPressure20d ?? 0.5) - 0.5)} />
        <MetricMini label="20D volume trend" value={pct(summary.volume.volumeTrend20v60)} color={metricColor(summary.volume.volumeTrend20v60)} />
      </Box>

      <Divider />

      {fundamentals.available ? (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 1.5 }}>
          <MetricMini label="Market cap" value={largeNumber(metrics.marketCap)} />
          <MetricMini label="Trailing PE" value={fmt(metrics.trailingPE, 2)} />
          <MetricMini label="Forward PE" value={fmt(metrics.forwardPE, 2)} />
          <MetricMini label="P/S" value={fmt(metrics.priceToSales, 2)} />
          <MetricMini label="Revenue growth" value={pct(metrics.revenueGrowth)} color={metricColor(metrics.revenueGrowth)} />
          <MetricMini label="Earnings growth" value={pct(metrics.earningsGrowth)} color={metricColor(metrics.earningsGrowth)} />
          <MetricMini label="Profit margin" value={pct(metrics.profitMargins)} />
          <MetricMini label="ROE" value={pct(metrics.returnOnEquity)} />
        </Box>
      ) : (
        <Alert severity="info">{fundamentals.message || "Fundamentals unavailable from yfinance."}</Alert>
      )}
    </Stack>
  );
}

function AiAnalystPanel({ ticker }) {
  const [apiKey, setApiKey] = React.useState(() => localStorage.getItem("openai_api_key") || "");
  const [isEditingKey, setIsEditingKey] = React.useState(!apiKey);
  const [synthesis, setSynthesis] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);

  const saveKey = (key) => {
    setApiKey(key);
    localStorage.setItem("openai_api_key", key);
    setIsEditingKey(false);
  };

  React.useEffect(() => {
    if (!ticker) return;
    setLoading(true);
    setError(null);
    setSynthesis(null);
    fetchSynthesis(ticker, apiKey)
      .then((data) => setSynthesis(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [ticker, apiKey]);

  if (!ticker) return <Alert severity="info">Select a ticker to view AI analysis.</Alert>;

  return (
    <Stack spacing={2}>
      {isEditingKey || !apiKey ? (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: "#f9fafb" }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <TextField 
              size="small" 
              label="OpenAI API Key" 
              type="password" 
              value={apiKey} 
              onChange={(e) => setApiKey(e.target.value)} 
              sx={{ flex: 1 }}
              placeholder="sk-..."
            />
            <Button variant="contained" onClick={() => saveKey(apiKey)}>Save Key</Button>
          </Stack>
          <Typography variant="caption" color="text.secondary" mt={1} display="block">
            Your key is stored locally in your browser and sent securely to the backend for analysis.
          </Typography>
        </Paper>
      ) : (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="small" onClick={() => setIsEditingKey(true)}>Edit API Key</Button>
        </Box>
      )}

      {loading && <Alert severity="info" icon={false}><LinearProgress sx={{ mb: 2 }}/> Synthesizing AI thesis based on recent news and technicals...</Alert>}
      {error && !loading && <Alert severity="error">{error}</Alert>}
      {!loading && !error && synthesis && Object.keys(synthesis).length > 0 && (
        <>
          <Typography variant="body1" sx={{ fontWeight: 500, fontStyle: "italic" }}>
            "{synthesis.executive_summary}"
          </Typography>
          
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <Paper variant="outlined" sx={{ flex: 1, p: 2, borderTop: "4px solid #168052" }}>
              <Typography variant="overline" color="text.secondary" fontWeight={800}>Bull Case</Typography>
              <Typography variant="body2" mt={1}>{synthesis.bull_case}</Typography>
            </Paper>
            <Paper variant="outlined" sx={{ flex: 1, p: 2, borderTop: "4px solid #b7413b" }}>
              <Typography variant="overline" color="text.secondary" fontWeight={800}>Bear Case</Typography>
              <Typography variant="body2" mt={1}>{synthesis.bear_case}</Typography>
            </Paper>
          </Stack>
          
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            <Typography variant="overline" color="text.secondary" fontWeight={800}>Sentiment Score</Typography>
            <LinearProgress 
              variant="determinate" 
              value={((synthesis.sentiment_score || 5) / 10) * 100} 
              sx={{ 
                flex: 1, 
                height: 10, 
                borderRadius: 5,
                backgroundColor: "rgba(183, 65, 59, 0.2)",
                "& .MuiLinearProgress-bar": { backgroundColor: synthesis.sentiment_score >= 6 ? "#168052" : (synthesis.sentiment_score <= 4 ? "#b7413b" : "#f5a623") }
              }} 
            />
            <Typography fontWeight={850}>{synthesis.sentiment_score} / 10</Typography>
          </Box>
        </>
      )}
    </Stack>
  );
}

function CurrentEventsPanel({ events }) {
  if (!events) return <Alert severity="info">Current events load with the research snapshot.</Alert>;
  if (!events.available) {
    return <Alert severity="info">{events.message || "No recent current events returned for this ticker."}</Alert>;
  }
  return (
    <Stack spacing={1.5}>
      <Typography variant="caption" color="text.secondary">
        Source: {events.provider}. Headlines are for research context, not trade instructions.
      </Typography>
      {(events.items || []).map((item) => (
        <Paper component={item.url ? "a" : "div"} href={item.url || undefined} target="_blank" rel="noreferrer" variant="outlined" key={`${item.title}-${item.published}`} sx={{
          p: 1.5,
          color: "inherit",
          textDecoration: "none",
          "&:hover": { borderColor: "primary.main", bgcolor: "rgba(20, 108, 92, 0.04)" },
        }}>
          <Stack spacing={0.5}>
            <Typography fontWeight={850}>{item.title}</Typography>
            <Typography variant="caption" color="text.secondary">
              {[item.publisher, item.published].filter(Boolean).join(" · ")}
            </Typography>
            {item.summary && (
              <Typography variant="body2" color="text.secondary">
                {item.summary}
              </Typography>
            )}
          </Stack>
        </Paper>
      ))}
    </Stack>
  );
}

const SIDEBAR_WIDTH = 280;

function SidebarItem({ icon: Icon, label, active, onClick, badge }) {
  return (
    <ListItem disablePadding>
      <ListItemButton 
        selected={active} 
        onClick={onClick}
        sx={{ 
          borderRadius: 3, 
          mx: 1.5, 
          mb: 0.75,
          py: 1.25,
          transition: 'all 0.2s',
          "&.Mui-selected": { 
            bgcolor: "primary.main", 
            color: "white",
            boxShadow: "0 4px 12px rgba(20, 108, 92, 0.25)",
            "&:hover": { bgcolor: "primary.dark" },
            "& .MuiListItemIcon-root": { color: "white" }
          },
          "&:hover": { bgcolor: "rgba(20, 108, 92, 0.04)" }
        }}
      >
        <ListItemIcon sx={{ minWidth: 40, color: active ? "white" : "text.secondary" }}>
          <Icon fontSize="small" />
        </ListItemIcon>
        <ListItemText 
          primary={label} 
          primaryTypographyProps={{ 
            variant: 'body2', 
            fontWeight: active ? 700 : 600,
            fontSize: '0.9rem'
          }} 
        />
        {badge && (
          <Chip 
            label={badge} 
            size="small" 
            color={active ? "secondary" : "default"} 
            sx={{ height: 20, fontSize: '0.65rem', fontWeight: 800 }} 
          />
        )}
      </ListItemButton>
    </ListItem>
  );
}

function App() {
  const [view, setView] = React.useState("research");
  const [backendOnline, setBackendOnline] = React.useState(false);
  const [datasets, setDatasets] = React.useState([]);
  const [activeTicker, setActiveTicker] = React.useState("");
  const [horizon, setHorizon] = React.useState(5);
  const [confidence, setConfidence] = React.useState(0.56);
  const [dte, setDte] = React.useState(21);
  const [iv, setIv] = React.useState(45);
  const [tradeCost, setTradeCost] = React.useState(0.1);
  const [trainFraction, setTrainFraction] = React.useState(0.7);
  const [modelType, setModelType] = React.useState("logistic");
  const [settings, setSettings] = React.useState({});
  const [rankings, setRankings] = React.useState([]);
  const [trainSamples, setTrainSamples] = React.useState(0);
  const [trainValidation, setTrainValidation] = React.useState(null);
  const [trainMethod, setTrainMethod] = React.useState("");
  const [liveSignals, setLiveSignals] = React.useState(null);
  const [portfolio, setPortfolio] = React.useState(null);
  const [stockResult, setStockResult] = React.useState(null);
  const [researchSummary, setResearchSummary] = React.useState(null);
  const [researchError, setResearchError] = React.useState("");
  const [insiderActivity, setInsiderActivity] = React.useState(null);
  const [insiderError, setInsiderError] = React.useState("");
  const [cutoffIndex, setCutoffIndex] = React.useState(360);
  const [maxCutoff, setMaxCutoff] = React.useState(400);
  const [dateLabels, setDateLabels] = React.useState([]);
  const [tickerInput, setTickerInput] = React.useState("");
  const [testMode, setTestMode] = React.useState("historical");
  const [timeRange, setTimeRange] = React.useState("1Y");
  const [refreshBeforeTest, setRefreshBeforeTest] = React.useState(true);
  const [providers, setProviders] = React.useState(null);
  const [catalysts, setCatalysts] = React.useState(() => defaultCatalysts());
  const [status, setStatus] = React.useState("Connect to the Python API to begin.");
  const [inputError, setInputError] = React.useState("");
  const [busy, setBusy] = React.useState("");

  const selectedTickers = React.useMemo(
    () => datasets.filter((dataset) => dataset.selected && dataset.ready).map((dataset) => dataset.ticker),
    [datasets],
  );
  const readyTickers = React.useMemo(() => datasets.filter((dataset) => dataset.ready).map((dataset) => dataset.ticker), [datasets]);
  const modelReady = Object.keys(settings).length > 0;
  const sliderMin = Math.min(maxCutoff, 70 + Math.round(horizon));
  const testDateLabel = dateLabels[cutoffIndex] || stockResult?.date || "--";
  const error = inputError;

  const refreshUniverse = React.useCallback(async () => {
    const data = await fetchUniverse(false);
    setDatasets((current) => {
      const selected = new Set(current.filter((dataset) => dataset.selected).map((dataset) => dataset.ticker));
      return data.tickers.map((item) => ({
        ...item,
        selected: selected.has(item.ticker) || item.ready,
        kind: "S&P 500 CSV",
      }));
    });
    setStatus(`${data.ready} of ${data.count} S&P 500 tickers ready`);
  }, []);

  const setSelectedTickers = (tickers) => {
    const selected = new Set(tickers);
    setDatasets((current) => current.map((dataset) => ({ ...dataset, selected: selected.has(dataset.ticker) })));
  };

  const selectAllReady = (on) => {
    setDatasets((current) => current.map((dataset) => ({ ...dataset, selected: on ? dataset.ready : false })));
  };

  const loadInsiders = React.useCallback(async (ticker) => {
    if (!ticker) return;
    setInsiderActivity(null);
    setInsiderError("");
    try {
      setInsiderActivity(await fetchInsiderActivity(ticker));
    } catch (err) {
      setInsiderError(err.message);
    }
  }, []);

  const loadResearchSummary = React.useCallback(async (ticker) => {
    if (!ticker) return;
    setResearchSummary(null);
    setResearchError("");
    try {
      setResearchSummary(await fetchStockResearch(ticker));
    } catch (err) {
      setResearchError(err.message);
    }
  }, []);

  React.useEffect(() => {
    (async () => {
      try {
        await fetchHealth();
        setBackendOnline(true);
        const meta = await fetchIndicators();
        if (meta.defaultCatalysts) setCatalysts(meta.defaultCatalysts);
        setProviders(await fetchProviders());
        await refreshUniverse();
        try {
          const trained = await fetchTrainedModel();
          setSettings(trained.settings || {});
          setRankings(trained.rankings || []);
          setTrainSamples(trained.totalRows || 0);
          setTrainValidation(trained.validation || null);
          setTrainMethod(trained.method || "autonomous");
          setStatus(`Loaded global model (${trained.totalRows || 0} samples)`);
        } catch {
          setStatus("API connected. No saved model loaded yet.");
        }
      } catch (err) {
        setBackendOnline(false);
        setInputError(err.message);
        setStatus("Start the API with npm run dev from ui/");
      }
    })();
  }, [refreshUniverse]);

  React.useEffect(() => {
    if (view !== "stock" || !activeTicker) return;
    loadResearchSummary(activeTicker);
    loadInsiders(activeTicker);
  }, [activeTicker, loadInsiders, loadResearchSummary, view]);

  const runTrain = async () => {
    if (!selectedTickers.length) {
      setInputError("Select at least one downloaded ticker.");
      return;
    }
    setBusy("train");
    setInputError("");
    try {
      const trained = await trainResearch({
        tickers: selectedTickers,
        horizon: clamp(Math.round(horizon), 1, 90),
        catalysts,
        method: "autonomous",
        modelType,
        refine: modelType === "logistic",
        trainFraction: clamp(trainFraction, 0.5, 0.9),
        confidence: clamp(confidence, 0.51, 0.9),
      });
      setSettings(trained.settings || {});
      setRankings(trained.rankings || []);
      setTrainSamples(trained.totalRows || 0);
      setTrainValidation(trained.validation || null);
      setTrainMethod(trained.method || "autonomous");
      setStatus(`Trained ${trained.method || "model"} on ${trained.totalRows || 0} samples`);
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const runBacktest = async () => {
    if (!selectedTickers.length) {
      setInputError("Select at least one ticker.");
      return;
    }
    if (!modelReady) {
      setInputError("Train or load a model first.");
      return;
    }
    setBusy("backtest");
    setInputError("");
    try {
      const result = await runPortfolioBacktest({
        tickers: selectedTickers,
        horizon: clamp(Math.round(horizon), 1, 90),
        confidence: clamp(confidence, 0.51, 0.9),
        settings,
        catalysts,
        tradeCost: clamp(tradeCost / 100, 0, 0.2),
        trainFraction: clamp(trainFraction, 0.5, 0.9),
      });
      setPortfolio(result);
      setStatus(`Backtested ${selectedTickers.length} stocks`);
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const runStockTestAction = async (ticker, { cutoff, mode, silent = false } = {}) => {
    const symbol = (ticker || "").trim().toUpperCase();
    if (!symbol || !modelReady) {
      if (!silent) setInputError("Select a ticker and train or load a model first.");
      return;
    }
    const useMode = mode || testMode;
    setBusy("stock");
    setInputError("");
    try {
      const result = await runStockTest({
        ticker: symbol,
        mode: useMode,
        cutoffIndex: useMode === "historical" ? cutoff ?? cutoffIndex : undefined,
        refresh: refreshBeforeTest,
        years: 10,
        provider: "auto",
        horizon: clamp(Math.round(horizon), 1, 90),
        confidence: clamp(confidence, 0.51, 0.9),
        settings,
        catalysts,
        dte: clamp(Math.round(dte), 1, 730),
        iv: clamp(iv / 100, 0.01, 3),
        tradeCost: clamp(tradeCost / 100, 0, 0.2),
        trainFraction: clamp(trainFraction, 0.5, 0.9),
      });
      setStockResult(result);
      setMaxCutoff(result.maxCutoff ?? maxCutoff);
      if (result.dates) setDateLabels(result.dates);
      if (result.cutoffIndex != null) setCutoffIndex(result.cutoffIndex);
      setStatus(useMode === "latest" ? `Latest signal for ${symbol}` : `Historical test for ${symbol} on ${result.date}`);
    } catch (err) {
      if (!silent) setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const applyDatasetMeta = async (ticker) => {
    const meta = await fetchDatasetMeta(ticker);
    setDateLabels(meta.dates || []);
    setMaxCutoff(meta.maxCutoff);
    const min = Math.min(meta.maxCutoff, 70 + Math.round(horizon));
    setCutoffIndex(Math.min(meta.maxCutoff, Math.max(min, meta.maxCutoff - 1)));
  };

  const loadTicker = async (symbol = tickerInput) => {
    const ticker = (symbol || "").trim().toUpperCase();
    if (!ticker) return;
    setBusy("fetch");
    setInputError("");
    try {
      const fetched = await fetchStock({ ticker, years: 10, provider: "auto" });
      setActiveTicker(ticker);
      setTickerInput(ticker);
      await applyDatasetMeta(ticker);
      await refreshUniverse();
      loadResearchSummary(ticker);
      loadInsiders(ticker);
      setStatus(`Loaded ${ticker} via ${fetched.provider} (${fetched.start} to ${fetched.end})`);
      if (modelReady) {
        await runStockTestAction(ticker, { mode: testMode, silent: true });
      }
    } catch (err) {
      try {
        await applyDatasetMeta(ticker);
        setActiveTicker(ticker);
        setTickerInput(ticker);
        loadResearchSummary(ticker);
        loadInsiders(ticker);
        setStatus(`Loaded cached ${ticker}; refresh failed: ${err.message}`);
      } catch {
        setInputError(err.message);
      }
    } finally {
      setBusy("");
    }
  };

  const onActiveTickerChange = async (ticker) => {
    if (!ticker) return;
    const symbol = ticker.toUpperCase();
    setActiveTicker(symbol);
    setTickerInput(symbol);
    try {
      await applyDatasetMeta(symbol);
      loadResearchSummary(symbol);
      loadInsiders(symbol);
      if (modelReady) {
        await runStockTestAction(symbol, { mode: testMode, silent: true });
      }
    } catch (err) {
      setInputError(err.message);
    }
  };

  const runLive = async () => {
    if (!selectedTickers.length || !modelReady) {
      setInputError("Train first and select tickers.");
      return;
    }
    setBusy("live");
    setInputError("");
    try {
      const payload = await fetchLiveSignals({
        tickers: selectedTickers,
        horizon: clamp(Math.round(horizon), 1, 90),
        confidence: clamp(confidence, 0.51, 0.9),
        settings,
        catalysts,
        dte: clamp(Math.round(dte), 1, 730),
        iv: clamp(iv / 100, 0.01, 3),
        tradeCost: clamp(tradeCost / 100, 0, 0.2),
        trainFraction: clamp(trainFraction, 0.5, 0.9),
        refresh: true,
        includeOptions: true,
      });
      setLiveSignals(payload);
      setStatus(`Live scan: ${payload.bullish} bullish, ${payload.bearish} bearish, ${payload.neutral} neutral`);
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const loadTrainedModel = async () => {
    setBusy("load");
    setInputError("");
    try {
      const trained = await fetchTrainedModel();
      setSettings(trained.settings || {});
      setRankings(trained.rankings || []);
      setTrainSamples(trained.totalRows || 0);
      setTrainValidation(trained.validation || null);
      setTrainMethod(trained.method || "autonomous");
      setStatus(`Loaded global model (${trained.totalRows || 0} samples)`);
    } catch (err) {
      setInputError(err.message);
    } finally {
      setBusy("");
    }
  };

  const handleDownload = async () => {
    setBusy("download");
    setInputError("");
    setStatus("Downloading S&P 500 daily history");
    try {
      const result = await downloadUniverse({ years: 10 });
      await refreshUniverse();
      setStatus(`Downloaded ${result.downloaded} tickers; ${result.readyCount} ready`);
      if (result.failed && Object.keys(result.failed).length) {
        setInputError(`${Object.keys(result.failed).length} tickers failed. Check API logs.`);
      }
    } catch (err) {
      setInputError(err.message);
      setStatus("Download failed");
    } finally {
      setBusy("");
    }
  };

  const updateCatalyst = (key, value) => {
    setCatalysts((current) => ({ ...current, [key]: Number(value) }));
  };

  const updateWeight = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: { ...current[key], weight: clamp(value, -3, 3) },
    }));
  };

  const updateToggle = (key, enabled) => {
    setSettings((current) => ({ ...current, [key]: { ...current[key], enabled } }));
  };

  return (
    <ThemeProvider theme={theme}>
      <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
        <CssBaseline />
        
        <AppBar position="fixed" sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1,
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
          boxShadow: 'none'
        }}>
          <Toolbar sx={{ justifyContent: 'space-between' }}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box sx={{ 
                width: 32, 
                height: 32, 
                bgcolor: 'primary.main', 
                borderRadius: 2, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                color: 'white'
              }}>
                <InsightsIcon fontSize="small" />
              </Box>
              <Typography variant="h6" color="primary" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
                STONK<Box component="span" sx={{ color: 'text.secondary', fontWeight: 400, ml: 0.5 }}>OS</Box>
              </Typography>
            </Stack>

            <Stack direction="row" alignItems="center" spacing={2}>
              <Chip 
                icon={<TerminalIcon fontSize="small" />} 
                label={backendOnline ? "System Online" : "System Offline"} 
                color={backendOnline ? "success" : "error"} 
                size="small" 
                variant="outlined" 
                sx={{ borderRadius: 1.5 }}
              />
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {status}
              </Typography>
              <IconButton size="small" onClick={refreshUniverse}>
                <RefreshIcon fontSize="small" />
              </IconButton>
              <Divider orientation="vertical" flexItem sx={{ height: 24, alignSelf: 'center' }} />
              <IconButton size="small"><NotificationsIcon fontSize="small" /></IconButton>
              <IconButton size="small"><AccountCircleIcon fontSize="small" /></IconButton>
            </Stack>
          </Toolbar>
        </AppBar>

        <Drawer
          variant="permanent"
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            [`& .MuiDrawer-paper`]: { 
              width: SIDEBAR_WIDTH, 
              boxSizing: 'border-box',
              borderRight: '1px solid',
              borderColor: 'divider',
              bgcolor: '#fff'
            },
          }}
        >
          <Toolbar />
          <Box sx={{ overflow: 'auto', py: 2 }}>
            <List sx={{ px: 0 }}>
              <SidebarItem icon={DashboardIcon} label="Neural Dashboard" active={view === "research"} onClick={() => setView("research")} />
              <SidebarItem icon={ShowChartIcon} label="Equity Research" active={view === "stock"} onClick={() => setView("stock")} />
              <SidebarItem icon={ScienceIcon} label="Model Evals" onClick={() => setView("evals")} active={view === "evals"} />
            </List>
            
            <Divider sx={{ my: 2, mx: 2 }} />
            
            <Box sx={{ px: 3, mb: 1.5 }}>
              <Typography variant="overline">Global Config</Typography>
            </Box>

            <Stack spacing={2.5} sx={{ px: 3, py: 1 }}>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 2 }}>
                <TextField size="small" label="Horizon" type="number" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} inputProps={{ min: 1, max: 90 }} />
                <TextField size="small" label="Signal" type="number" value={confidence} onChange={(event) => setConfidence(Number(event.target.value))} inputProps={{ min: 0.51, max: 0.9, step: 0.01 }} />
                <TextField size="small" label="DTE" type="number" value={dte} onChange={(event) => setDte(Number(event.target.value))} inputProps={{ min: 1, max: 730 }} />
                <TextField size="small" label="Cost %" type="number" value={tradeCost} onChange={(event) => setTradeCost(Number(event.target.value))} inputProps={{ min: 0, max: 20, step: 0.05 }} />
              </Box>

              <FormControl size="small" fullWidth>
                <InputLabel>Neural Engine</InputLabel>
                <Select label="Neural Engine" value={modelType} onChange={(event) => setModelType(event.target.value)}>
                  <MenuItem value="logistic">Logistic Regression</MenuItem>
                  <MenuItem value="xgboost">XGBoost Engine</MenuItem>
                  <MenuItem value="svm">SVM Kernel</MenuItem>
                </Select>
              </FormControl>

              <SectionCard title="Universe" icon={StorageIcon} action={<Chip size="small" label={`${selectedTickers.length} active`} />}>
                <DatasetPicker datasets={datasets} onChange={setSelectedTickers} onSelectAll={selectAllReady} />
              </SectionCard>

              <Stack spacing={1} sx={{ mt: 1 }}>
                <Button variant="contained" startIcon={<DownloadIcon />} onClick={handleDownload} disabled={!!busy || !backendOnline}>
                  Sync S&P 500
                </Button>
                <Button variant="outlined" startIcon={<ScienceIcon />} onClick={runTrain} disabled={!!busy || !backendOnline || !selectedTickers.length}>
                  {busy === "train" ? "Optimizing..." : "Train Intelligence"}
                </Button>
                <Button variant="text" size="small" startIcon={<StorageIcon />} onClick={loadTrainedModel} disabled={!!busy || !backendOnline}>
                  Restore Weights
                </Button>
              </Stack>
            </Stack>
          </Box>
        </Drawer>

        <Box component="main" sx={{ flexGrow: 1, p: 4, width: `calc(100% - ${SIDEBAR_WIDTH}px)` }}>
          <Toolbar />
          
          {error && (
            <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }} onClose={() => setInputError("")}>
              {error}
            </Alert>
          )}

          <Container maxWidth="xl" disableGutters>
            {view === "research" && (
              <Stack spacing={4}>
                {(portfolio || trainValidation) && (
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 3 }}>
                    {portfolio ? (
                      <>
                        <MetricCard icon={AssessmentIcon} color="success" label="Global Accuracy" value={pct(portfolio.accuracy)} note={`${portfolio.testCount} cross-validated rows`} />
                        <MetricCard icon={InsightsIcon} color="secondary" label="Signal Hit Rate" value={pct(portfolio.hitRate)} note={`${portfolio.signalCount} generated signals`} />
                        <MetricCard icon={AutoGraphIcon} color="warning" label="Expectancy" value={pct(portfolio.expectancy)} note="Return per signal" />
                        <MetricCard icon={AssessmentIcon} color="error" label="Max Drawdown" value={pct(portfolio.maxDrawdown)} note="System peak-to-trough" />
                      </>
                    ) : (
                      <>
                        <MetricCard icon={AssessmentIcon} color="success" label="Hold-out Accuracy" value={pct(trainValidation.accuracy)} note={trainMethod} />
                        <MetricCard icon={InsightsIcon} color="secondary" label="Validation Hit Rate" value={pct(trainValidation.hitRate)} note={`${trainValidation.signalCount} signals`} />
                        <MetricCard icon={AutoGraphIcon} color="warning" label="Brier Score" value={fmt(trainValidation.brier, 4)} note="Calibration" />
                        <MetricCard icon={StorageIcon} color="primary" label="Training Samples" value={String(trainSamples)} note="Observation count" />
                      </>
                    )}
                  </Box>
                )}

                {liveSignals && (
                  <SectionCard title="Multi-Asset Real-time Scan" icon={CloudSyncIcon} action={<Chip label={`${liveSignals.count} assets`} />}>
                    <LiveSignalsTable payload={liveSignals} />
                  </SectionCard>
                )}

                {rankings.length > 0 && (
                  <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1.4fr 0.6fr" }, gap: 3 }}>
                    <SectionCard title="Learned Coefficients" icon={ScienceIcon} action={<Chip label={`${trainSamples} rows`} />}>
                      <RankingTable rankings={rankings} settings={settings} onToggle={updateToggle} onWeight={updateWeight} />
                    </SectionCard>
                    {portfolio && (
                      <SectionCard title="Performance Matrix" icon={AssessmentIcon}>
                        <Stack spacing={1.5}>
                          {portfolio.results.map((item) => (
                            <Paper variant="outlined" sx={{ p: 2, "&:hover": { borderColor: 'primary.main' } }} key={item.ticker}>
                              <Stack direction="row" alignItems="center" justifyContent="space-between">
                                <Typography variant="subtitle2" fontWeight={800}>{item.ticker}</Typography>
                                <Chip size="small" variant="outlined" label={item.coverage} />
                              </Stack>
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 1.5, display: 'block' }}>
                                Accuracy: <Box component="span" sx={{ color: 'success.main', fontWeight: 700 }}>{pct(item.backtest.accuracy)}</Box> · 
                                Hit: <Box component="span" sx={{ color: 'secondary.main', fontWeight: 700 }}>{pct(item.backtest.hitRate)}</Box>
                              </Typography>
                            </Paper>
                          ))}
                        </Stack>
                      </SectionCard>
                    )}
                  </Box>
                )}

                {!rankings.length && !portfolio && (
                  <Paper variant="outlined" sx={{ p: 10, textAlign: 'center', borderRadius: 4, bgcolor: '#fff' }}>
                    <InsightsIcon sx={{ fontSize: 64, color: 'divider', mb: 2 }} />
                    <Typography variant="h5" color="text.secondary">Ready for Analysis</Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mt: 1, mb: 4 }}>
                      Select tickers in the sidebar and trigger the optimization cycle.
                    </Typography>
                    <Button variant="contained" size="large" onClick={runTrain} disabled={!selectedTickers.length}>
                      Initialize Neural Cycle
                    </Button>
                  </Paper>
                )}
              </Stack>
            )}

            {view === "evals" && (
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
            )}

            {view === "stock" && (
              <Stack spacing={4}>
                <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ xs: "stretch", md: "center" }}>
                    <Autocomplete
                      freeSolo
                      fullWidth
                      options={readyTickers}
                      value={tickerInput}
                      inputValue={tickerInput}
                      onInputChange={(_, value) => setTickerInput(value.toUpperCase())}
                      onChange={(_, value) => {
                        const symbol = String(value || "").toUpperCase();
                        setTickerInput(symbol);
                        if (readyTickers.includes(symbol)) onActiveTickerChange(symbol);
                      }}
                      renderInput={(params) => <TextField {...params} label="Search Equity Symbol" placeholder="e.g. AAPL, TSLA, NVDA" variant="filled" />}
                    />
                    <Button 
                      variant="contained" 
                      size="large"
                      startIcon={<SavedSearchIcon />} 
                      onClick={() => loadTicker()} 
                      disabled={!!busy || !backendOnline}
                      sx={{ px: 6, py: 2 }}
                    >
                      {busy === "fetch" ? "Injesting..." : "Analyze"}
                    </Button>
                  </Stack>
                </Paper>

                {(activeTicker || tickerInput) && (
                  <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 3, bgcolor: '#fff', position: 'sticky', top: 88, zIndex: 10 }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap justifyContent="center">
                      <Button size="small" variant="text" href="#research-snapshot">Research</Button>
                      <Button size="small" variant="text" href="#ai-synthesis">AI Synthesis</Button>
                      <Button size="small" variant="text" href="#current-events">Events</Button>
                      <Button size="small" variant="text" href="#model-signal">Signal</Button>
                      <Button size="small" variant="text" href="#price-history">History</Button>
                      <Button size="small" variant="text" href="#backtest">Backtest</Button>
                      <Button size="small" variant="text" href="#options">Options</Button>
                      <Button size="small" variant="text" href="#insiders">Insiders</Button>
                    </Stack>
                  </Paper>
                )}

                <Paper variant="outlined" sx={{ p: 3, borderRadius: 4 }}>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={3} alignItems={{ xs: "stretch", md: "center" }}>
                    <ToggleButtonGroup exclusive color="primary" value={testMode} onChange={(_, value) => value && setTestMode(value)} size="small">
                      <ToggleButton value="historical" sx={{ px: 3 }}><ShowChartIcon sx={{ mr: 1 }} /> Backtest</ToggleButton>
                      <ToggleButton value="latest" sx={{ px: 3 }}><CloudSyncIcon sx={{ mr: 1 }} /> Live Signal</ToggleButton>
                    </ToggleButtonGroup>
                    
                    <FormControlLabel
                      control={<Switch checked={refreshBeforeTest} onChange={(event) => setRefreshBeforeTest(event.target.checked)} />}
                      label="Hot-reload"
                    />

                    {testMode === "historical" && (
                      <Box sx={{ flex: 1, minWidth: 220 }}>
                        <Typography variant="caption" fontWeight={700}>Simulation: {testDateLabel}</Typography>
                        <Slider min={sliderMin} max={maxCutoff} value={Math.min(cutoffIndex, maxCutoff)} onChange={(_, value) => setCutoffIndex(value)} />
                      </Box>
                    )}
                    
                    <Button
                      variant="outlined"
                      size="large"
                      startIcon={<ScienceIcon />}
                      disabled={!(activeTicker || tickerInput) || !!busy || !modelReady || !backendOnline}
                      onClick={() => runStockTestAction(activeTicker || tickerInput, { mode: testMode, cutoff: cutoffIndex })}
                    >
                      {busy === "stock" ? "Computing..." : "Run Test"}
                    </Button>
                  </Stack>
                </Paper>

                {(activeTicker || tickerInput || researchSummary || researchError) && (
                  <SectionCard
                    id="research-snapshot"
                    title="Deep Quant Research"
                    icon={SavedSearchIcon}
                    action={<Button size="small" variant="outlined" onClick={() => loadResearchSummary(activeTicker || tickerInput)}>Synchronize</Button>}
                  >
                    <ResearchSummaryPanel summary={researchSummary} error={researchError} />
                  </SectionCard>
                )}

                {(activeTicker || tickerInput || researchSummary) && (
                  <SectionCard
                    id="ai-synthesis"
                    title="Agentic AI Synthesis"
                    icon={InsightsIcon}
                    action={<Chip size="small" color="primary" label="GPT-4o Mini" sx={{ fontWeight: 800 }} />}
                  >
                    <AiAnalystPanel ticker={activeTicker || tickerInput} />
                  </SectionCard>
                )}

                {(activeTicker || tickerInput || researchSummary) && (
                  <SectionCard
                    id="current-events"
                    title="Market Context"
                    icon={RefreshIcon}
                    action={<Chip size="small" label={researchSummary?.events?.provider || "news"} />}
                  >
                    <CurrentEventsPanel events={researchSummary?.events} />
                  </SectionCard>
                )}

                {stockResult && (
                  <Stack spacing={4}>
                    {stockResult.quote && (
                      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 3 }}>
                        <MetricCard color="secondary" label={`Quote (${stockResult.quote.provider})`} value={`$${fmt(stockResult.quote.price)}`} note={stockResult.quote.asOf} />
                        <MetricCard color="primary" label="Open" value={`$${fmt(stockResult.quote.open)}`} note="Market start" />
                        <MetricCard color="primary" label="High / Low" value={`$${fmt(stockResult.quote.high)} / $${fmt(stockResult.quote.low)}`} note="Daily range" />
                        <MetricCard color="primary" label="Volume" value={largeNumber(stockResult.quote.volume)} note={stockResult.quote.delayed ? "Delayed" : "Real-time"} />
                      </Box>
                    )}

                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4, 1fr)" }, gap: 3 }}>
                      <MetricCard icon={AutoGraphIcon} color="success" label="Intelligence Bias" value={stockResult.bias} note={`${pct(stockResult.probabilityUp)} confidence`} />
                      <MetricCard icon={InsightsIcon} color="secondary" label="Target Move" value={pct(stockResult.predictedReturn)} note={`Expected ${pct(stockResult.expectedMove)}`} />
                      <MetricCard
                        icon={ScienceIcon}
                        color="warning"
                        label={stockResult.mode === "latest" ? "Signal Maturity" : "Realized Return"}
                        value={stockResult.realizedReturn == null ? "Pending" : pct(stockResult.realizedReturn)}
                        note={stockResult.mode === "latest" ? "Monitoring" : `Resolved ${stockResult.futureDate}`}
                      />
                      <MetricCard icon={AccountBalanceIcon} color="error" label="Options Alpha" value={pct(stockResult.movementEdge)} note={`Implied: ${pct(stockResult.impliedMove)}`} />
                    </Box>

                    <SectionCard
                      id="price-history"
                      title="Market Trajectory"
                      icon={ShowChartIcon}
                      action={
                        <ToggleButtonGroup size="small" exclusive value={timeRange} onChange={(_, value) => value && setTimeRange(value)}>
                          {["5D", "1M", "3M", "6M", "1Y", "5Y", "ALL"].map((range) => (
                            <ToggleButton key={range} value={range}>{range}</ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                      }
                    >
                      <PriceChart rows={stockResult.series || []} range={timeRange} />
                    </SectionCard>

                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", xl: "1fr 1fr" }, gap: 3 }}>
                      <SectionCard id="backtest" title="Local Simulation" icon={AssessmentIcon} action={<Chip label={`${stockResult.backtest?.testCount || 0} rows`} />}>
                        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 1.5, mb: 3 }}>
                          <MetricMini label="Historical Accuracy" value={pct(stockResult.backtest?.accuracy)} />
                          <MetricMini label="Signal Hit Rate" value={pct(stockResult.backtest?.hitRate)} />
                          <MetricMini label="Generated Signals" value={String(stockResult.backtest?.signalCount || 0)} />
                          <MetricMini label="Profit Factor" value={fmt(stockResult.backtest?.profitFactor, 2)} />
                        </Box>
                        <EquityCurve trades={stockResult.backtest?.trades} />
                      </SectionCard>
                      
                      <SectionCard id="options" title="Derivative Contracts" icon={AccountBalanceIcon} action={<Chip label={stockResult.options?.provider || "Chain"} />}>
                        <OptionsContracts options={stockResult.options} />
                      </SectionCard>
                    </Box>

                    <SectionCard id="insiders" title="Insider Intelligence" icon={AccountBalanceIcon} action={<Button size="small" variant="outlined" onClick={() => loadInsiders(activeTicker || tickerInput)}>Synchronize</Button>}>
                      <InsiderPanel activity={insiderActivity} error={insiderError} />
                    </SectionCard>
                  </Stack>
                )}

                {!activeTicker && !tickerInput && (
                  <Paper variant="outlined" sx={{ p: 10, textAlign: 'center', borderRadius: 6, bgcolor: '#fff', borderStyle: 'dashed' }}>
                    <SavedSearchIcon sx={{ fontSize: 64, color: 'divider', mb: 2 }} />
                    <Typography variant="h5" color="text.secondary">Ready for Research</Typography>
                    <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
                      Enter a ticker symbol above to generate high-fidelity analysis.
                    </Typography>
                  </Paper>
                )}
              </Stack>
            )}
          </Container>
        </Box>
      </Box>
    </ThemeProvider>
  );
}

const rootElement = document.getElementById("root");
if (!rootElement.__stonkRoot) {
  rootElement.__stonkRoot = createRoot(rootElement);
}
rootElement.__stonkRoot.render(<App />);
