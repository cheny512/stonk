export interface Catalysts {
  earningsSurprise: number;
  revenueSurprise: number;
  guidanceRevision: number;
  contractBacklog: number;
  newsSentiment: number;
  ceoCredibility: number;
  macroRates: number;
  sectorRelativeStrength: number;
}

export interface IndicatorSetting {
  enabled: boolean;
  weight: number;
}

export interface ModelSettings {
  [key: string]: IndicatorSetting;
}

export interface TrainRequest {
  tickers: string[];
  horizon: number;
  catalysts?: Catalysts;
  method?: "autonomous" | "correlation";
  modelType?: "logistic" | "xgboost" | "svm";
  refine?: boolean;
  trainFraction?: number;
  confidence?: number;
}

export interface PortfolioRequest {
  tickers: string[];
  horizon: number;
  confidence: number;
  settings: ModelSettings;
  catalysts?: Catalysts;
  tradeCost: number;
  trainFraction: number;
}

export interface StockFetchRequest {
  ticker: string;
  years?: number;
  provider?: "auto" | "polygon" | "yfinance";
}

export interface LiveSignalsRequest {
  tickers: string[];
  horizon: number;
  confidence: number;
  settings: ModelSettings;
  catalysts?: Catalysts;
  dte: number;
  iv: number;
  tradeCost: number;
  trainFraction: number;
  refresh?: boolean;
  includeOptions?: boolean;
}

export interface StockTestRequest {
  ticker: string;
  mode?: "historical" | "latest";
  includeOptions?: boolean;
  cutoffIndex?: number | null;
  asOf?: string | null;
  refresh?: boolean;
  years?: number;
  provider?: "auto" | "polygon" | "yfinance";
  horizon: number;
  confidence: number;
  settings: ModelSettings;
  catalysts?: Catalysts;
  dte: number;
  iv: number;
  tradeCost: number;
  trainFraction: number;
}

export interface EquityBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface StockHistory {
  ticker: string;
  provider?: string;
  interval: "1d";
  adjusted: boolean;
  rows: number;
  start: string;
  end: string;
  series: EquityBar[];
}

export interface OptionQuote {
  symbol: string;
  underlying: string;
  expiration: string;
  strike: number;
  right: "call" | "put";
  bid: number;
  ask: number;
  mid: number;
  impliedVol?: number;
  delta?: number;
  openInterest?: number;
  volume?: number;
}

export interface OptionsChain {
  available: boolean;
  message?: string;
  underlying: string;
  asOf: string;
  spot?: number;
  quotes?: OptionQuote[];
  contracts?: OptionQuote[];
  provider: string;
  medianIv?: number | null;
  analysisIv?: number;
  ivSource?: "observed-contract-median" | "scenario-assumption";
  tradeEligible?: boolean;
  screeningNote?: string;
}

export interface BacktestTrade {
  date: string;
  side: "long" | "short" | "flat";
  probabilityUp: number;
  predictedReturn: number;
  realizedReturn: number;
  pnl: number;
}

export interface BacktestResult {
  totalExamples: number;
  trainExamples: number;
  testExamples: number;
  accuracyAll: number;
  signalCount: number;
  signalHitRate: number;
  avgSignalReturn: number;
  avgSignalPnl: number;
  cumulativePnl: number;
  maxDrawdown: number;
  brierScore: number;
  trades: BacktestTrade[];
}

export interface InvestmentThesis {
  executiveSummary: string;
  bullCase: string;
  bearCase: string;
  sentimentScore: number;
  uncertainties?: string[];
  whatWouldChangeMyMind?: string[];
  evidenceCitations?: string[];
  provider?: string;
  groundingStatus?: "grounded" | "deterministic" | "rejected";
}

export interface TradePlan {
  action: string;
  bias: string;
  asOf: string;
  horizonDays: number;
  entryZone: { low: number; high: number };
  entryCondition: string;
  invalidation: number;
  targets: number[];
  support20d: number;
  resistance20d: number;
  atr14: number;
  estimatedRiskReward?: number;
  rejectionReasons?: string[];
  exitRules: string[];
  evidence: {
    backtestHitRate: number;
    backtestSignals: number;
    profitFactor: number;
    evidenceSufficient: boolean;
    historicallyValidated: boolean;
    minimumHitRate: number;
    minimumProfitFactor: number;
    minimumRiskReward: number;
  };
  riskNote: string;
}

export interface RulesThesis {
  ticker: string;
  stance: string;
  conviction: "low" | "moderate" | "high";
  summary: string;
  bullCase: string;
  baseCase: string;
  bearCase: string;
  evidence: string[];
  currentEventHeadlines: string[];
  methodology: string;
  disclaimer: string;
}

export interface Dataset {
  ticker: string;
  rows: number;
  start: string;
  end: string;
  error?: string;
  ready: boolean;
  selected?: boolean;
  kind?: string;
}

export interface UniverseResponse {
  tickers: Dataset[];
  count: number;
  ready: number;
}

export interface LiveSignal {
  ticker: string;
  signal: "BULLISH" | "BEARISH" | "NEUTRAL";
  probability: number;
  expectedReturn: number;
  price: number;
  options?: OptionsChain;
}

export interface LiveSignalsResponse {
  signals: LiveSignal[];
  count: number;
  bullish: number;
  bearish: number;
  neutral: number;
}
