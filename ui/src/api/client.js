const API_BASE = import.meta.env.VITE_API_BASE || "/api";

async function request(path, { method = "GET", body, params, headers } = {}) {
  const query = params ? new URLSearchParams(params) : null;
  const url = `${API_BASE}${path}${query?.size ? `?${query}` : ""}`;
  
  const finalHeaders = { ...(headers || {}) };
  if (body) {
    finalHeaders["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    method,
    headers: Object.keys(finalHeaders).length > 0 ? finalHeaders : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    let detail = response.statusText;
    try {
      const payload = await response.json();
      detail = payload.error?.message || payload.detail || JSON.stringify(payload);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return response.json();
}

export function fetchHealth() {
  return request("/health");
}

export function fetchAiHealth() {
  return request("/ai/health");
}

export function fetchIndicators() {
  return request("/meta/indicators");
}

export function fetchProviders() {
  return request("/meta/providers");
}

export function fetchUniverse(onlyReady = false) {
  return request("/universe", { params: { only_ready: onlyReady ? "true" : "false" } });
}

export function downloadUniverse({ years = 10, limit = null, tickers = null } = {}) {
  return request("/universe/download", {
    method: "POST",
    body: { years, limit, tickers },
  });
}

export function trainResearch({
  tickers,
  horizon,
  catalysts,
  method = "autonomous",
  modelType = "logistic",
  refine = true,
  trainFraction = 0.7,
  confidence = 0.56,
}) {
  return request("/research/train", {
    method: "POST",
    body: {
      tickers,
      horizon,
      catalysts,
      method,
      model_type: modelType,
      refine,
      train_fraction: trainFraction,
      confidence,
    },
  });
}

export function fetchLiveSignals({
  tickers,
  horizon,
  confidence,
  settings,
  catalysts,
  dte,
  iv,
  tradeCost,
  trainFraction,
  refresh = true,
  includeOptions = true,
}) {
  return request("/live/signals", {
    method: "POST",
    body: {
      tickers,
      horizon,
      confidence,
      settings,
      catalysts,
      dte,
      iv,
      trade_cost: tradeCost,
      train_fraction: trainFraction,
      refresh,
      include_options: includeOptions,
    },
  });
}

export function runPortfolioBacktest({
  tickers,
  horizon,
  confidence,
  settings,
  catalysts,
  tradeCost,
  trainFraction,
}) {
  return request("/research/portfolio", {
    method: "POST",
    body: {
      tickers,
      horizon,
      confidence,
      settings,
      catalysts,
      trade_cost: tradeCost,
      train_fraction: trainFraction,
    },
  });
}

export function fetchStock({ ticker, years = 10, provider = "auto" }) {
  return request("/stock/fetch", {
    method: "POST",
    body: { ticker, years, provider },
  });
}

export function fetchStockQuote(ticker) {
  return request(`/stock/${encodeURIComponent(ticker)}/quote`);
}

export function fetchStockHistory(ticker) {
  return request(`/stock/${encodeURIComponent(ticker)}/history`);
}

export function fetchStockResearch(ticker) {
  return request(`/stock/${encodeURIComponent(ticker)}/research`);
}

export function runStockAutopilot(ticker, {
  refresh = true,
  years = 10,
  provider = "auto",
  horizon = 5,
  confidence = 0.56,
  dte = 21,
  iv = 0.45,
  tradeCost = 0.001,
  trainFraction = 0.7,
  includeOptions = true,
} = {}) {
  return request(`/stock/${encodeURIComponent(ticker)}/autopilot`, {
    method: "POST",
    body: {
      refresh,
      years,
      provider,
      horizon,
      confidence,
      dte,
      iv,
      trade_cost: tradeCost,
      train_fraction: trainFraction,
      include_options: includeOptions,
    },
  });
}

export function fetchSynthesis(ticker) {
  return request(`/stock/${encodeURIComponent(ticker)}/synthesis`);
}

/**
 * @param {import("./types").StockTestRequest} body
 */
export function runStockTest({
  ticker,
  mode = "historical",
  cutoffIndex = null,
  asOf = null,
  refresh = false,
  years = 10,
  provider = "auto",
  horizon,
  confidence,
  settings,
  catalysts,
  dte,
  iv,
  tradeCost,
  trainFraction,
  includeOptions = true,
}) {
  return request("/stock/test", {
    method: "POST",
    body: {
      ticker,
      mode,
      cutoff_index: cutoffIndex,
      as_of: asOf,
      refresh,
      years,
      provider,
      horizon,
      confidence,
      settings,
      catalysts,
      dte,
      iv,
      trade_cost: tradeCost,
      train_fraction: trainFraction,
      include_options: includeOptions,
    },
  });
}

export function fetchDatasetMeta(ticker) {
  return request(`/datasets/${encodeURIComponent(ticker)}/meta`);
}

export function fetchTrainedModel() {
  return request("/research/model");
}

export function fetchInsiderActivity(ticker) {
  return request(`/stock/${encodeURIComponent(ticker)}/insiders`);
}
