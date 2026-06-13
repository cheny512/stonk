export function fmt(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

export function money(value: number | null | undefined, digits = 0): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: digits,
  });
}

export function largeNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "--";
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000_000) return `${fmt(value / 1_000_000_000_000, 2)}T`;
  if (abs >= 1_000_000_000) return `${fmt(value / 1_000_000_000, 2)}B`;
  if (abs >= 1_000_000) return `${fmt(value / 1_000_000, 2)}M`;
  if (abs >= 1_000) return `${fmt(value / 1_000, 2)}K`;
  return fmt(value, 0);
}

export function pct(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(digits)}%`;
}

export function titleize(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (ch) => ch.toUpperCase());
}

export function metricColor(value: number | null | undefined): "success" | "error" | "default" {
  if (value == null || !Number.isFinite(value)) return "default";
  if (value > 0) return "success";
  if (value < 0) return "error";
  return "default";
}

export function dateLabel(value: string | number | null | undefined): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
