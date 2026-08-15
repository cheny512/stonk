import React from "react";
import { Alert, Box, Chip, Paper, Stack, Typography } from "@mui/material";
import { fmt, largeNumber, pct } from "../../lib/format";

interface Lens {
  title: string;
  status: string;
  color: "success" | "warning" | "error" | "default";
  observation: string;
  lesson: string;
}

function present(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function JudgmentGuide({ research, result }: { research?: any; result?: any }) {
  if (!research) return <Alert severity="info">The evaluation guide will populate when market research finishes.</Alert>;

  const fundamentals = research.fundamentals?.metrics || {};
  const history = research.history || {};
  const volatility = research.volatility || {};
  const indicators = research.indicators || {};
  const volume = research.volume || {};
  const events = research.events?.items || [];
  const backtest = result?.backtest || {};
  const options = result?.options;
  const trend = indicators.trend || "unknown";

  const growthParts = [
    present(fundamentals.revenueGrowth) ? `revenue growth ${pct(fundamentals.revenueGrowth)}` : null,
    present(fundamentals.earningsGrowth) ? `earnings growth ${pct(fundamentals.earningsGrowth)}` : null,
    present(fundamentals.profitMargins) ? `net margin ${pct(fundamentals.profitMargins)}` : null,
  ].filter(Boolean);
  const valuationParts = [
    present(fundamentals.trailingPE) ? `P/E ${fmt(fundamentals.trailingPE, 1)}×` : null,
    present(fundamentals.priceToSales) ? `price/sales ${fmt(fundamentals.priceToSales, 1)}×` : null,
    present(fundamentals.priceToBook) ? `price/book ${fmt(fundamentals.priceToBook, 1)}×` : null,
  ].filter(Boolean);
  const financialParts = [
    present(fundamentals.freeCashflow) ? `free cash flow ${largeNumber(fundamentals.freeCashflow)}` : null,
    present(fundamentals.debtToEquity) ? `debt/equity ${fmt(fundamentals.debtToEquity, 1)}` : null,
    present(fundamentals.returnOnEquity) ? `ROE ${pct(fundamentals.returnOnEquity)}` : null,
  ].filter(Boolean);
  const enoughBacktest = (backtest.signalCount || 0) >= 20;
  const validatedBacktest = enoughBacktest && (backtest.hitRate || 0) >= 0.52;

  const lenses: Lens[] = [
    {
      title: "Business quality & growth",
      status: growthParts.length ? "Data available" : "Needs filings",
      color: growthParts.length ? "success" : "warning",
      observation: growthParts.length ? growthParts.join(" · ") : "Growth and margin fields were not returned by the data provider.",
      lesson: "Look for durable revenue growth, improving margins, defensible advantages, and returns on capital—not growth purchased with excessive spending.",
    },
    {
      title: "Valuation",
      status: valuationParts.length ? "Compare with peers" : "Needs comparison",
      color: "default",
      observation: valuationParts.length ? valuationParts.join(" · ") : "Comparable valuation multiples are unavailable.",
      lesson: "A low multiple is not automatically cheap and a high multiple is not automatically expensive. Compare growth, margins, cyclicality, and peers.",
    },
    {
      title: "Financial durability",
      status: financialParts.length ? "Review balance sheet" : "Needs filings",
      color: financialParts.length ? "default" : "warning",
      observation: financialParts.length ? financialParts.join(" · ") : "Cash-flow and leverage fields are incomplete.",
      lesson: "Check free cash flow, debt maturities, dilution, liquidity, and whether the business can fund itself through a downturn.",
    },
    {
      title: "Price trend & momentum",
      status: trend === "uptrend" ? "Uptrend" : trend === "downtrend" ? "Downtrend" : "Mixed",
      color: trend === "uptrend" ? "success" : trend === "downtrend" ? "error" : "warning",
      observation: `Trend ${trend} · 1M return ${pct(history.return1m)} · 1Y return ${pct(history.return1y)} · RSI ${fmt(indicators.rsi14, 1)}.`,
      lesson: "Trend describes market behavior, not business value. Use it to time risk and confirm demand, never as the whole thesis.",
    },
    {
      title: "Risk & volatility",
      status: (volatility.realized1y || 0) >= 0.5 ? "High volatility" : "Measure position size",
      color: (volatility.realized1y || 0) >= 0.5 ? "error" : "warning",
      observation: `Annualized volatility ${pct(volatility.realized1y)} · 52-week drawdown ${pct(history.drawdownFrom52wHigh)} · ATR ${pct(volatility.atr14)}.`,
      lesson: "Judge downside before upside. Position size, invalidation, correlation, liquidity, and maximum tolerable loss matter more than a price target.",
    },
    {
      title: "Demand & participation",
      status: present(volume.relativeVolume20d) && volume.relativeVolume20d >= 1.5 ? "Unusual volume" : "Normal volume",
      color: present(volume.relativeVolume20d) && volume.relativeVolume20d >= 1.5 ? "success" : "default",
      observation: `Relative volume ${fmt(volume.relativeVolume20d, 2)}× · 20-day up-volume share ${pct(volume.buyPressure20d)}.`,
      lesson: "Volume can confirm a breakout or reveal weak participation, but one high-volume day needs context from news and the broader market.",
    },
    {
      title: "Catalysts & current events",
      status: events.length ? `${events.length} recent sources` : "No recent sources",
      color: events.length ? "success" : "warning",
      observation: events.length ? events.slice(0, 2).map((item: any) => item.title).join(" · ") : "No recent headlines were returned.",
      lesson: "Separate one-time headlines from changes to earnings power. Verify dates, primary sources, expectations, and what the market already priced in.",
    },
    {
      title: "Model & backtest evidence",
      status: validatedBacktest ? "Historically supported" : enoughBacktest ? "Weak history" : "Insufficient sample",
      color: validatedBacktest ? "success" : "warning",
      observation: `${pct(backtest.hitRate)} hit rate across ${backtest.signalCount || 0} signals · profit factor ${fmt(backtest.profitFactor, 2)}.`,
      lesson: "A backtest is evidence about a rule under past conditions—not a forecast guarantee. Check sample size, costs, drawdowns, leakage, and regime changes.",
    },
    {
      title: "Options expectations",
      status: options?.available ? "Live chain available" : "Chain unavailable",
      color: options?.available ? "success" : "warning",
      observation: options?.available
        ? `${String(options.side || "neutral")} setup · median IV ${pct(options.medianIv)} · target expiration ${options.targetExpiration}.`
        : "No authorized live options chain is available for comparison.",
      lesson: "Options encode volatility and positioning, not certain direction. Compare implied versus expected movement, spreads, liquidity, time decay, and maximum loss.",
    },
  ];

  return (
    <Stack spacing={2.5}>
      <Box>
        <Typography variant="h6">Build a judgment from independent evidence</Typography>
        <Typography color="text.secondary" sx={{ mt: 0.5 }}>
          No single ratio, chart pattern, headline, or model output decides whether a stock is attractive. Work through every lens and write down what would change your mind.
        </Typography>
      </Box>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(2, 1fr)" }, gap: 1.5 }}>
        {lenses.map((lens) => (
          <Paper key={lens.title} variant="outlined" sx={{ p: 2.25 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
              <Typography fontWeight={800}>{lens.title}</Typography>
              <Chip size="small" label={lens.status} color={lens.color} />
            </Stack>
            <Typography variant="body2" sx={{ mt: 1.25 }}>{lens.observation}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}><strong>How to judge it:</strong> {lens.lesson}</Typography>
          </Paper>
        ))}
      </Box>
      <Alert severity="info">
        Finish with three questions: What must go right? What can permanently impair the business? What evidence would invalidate the thesis?
      </Alert>
    </Stack>
  );
}
