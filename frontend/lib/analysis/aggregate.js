import { METRIC_KEYS } from "@/lib/types/analysis";

function mean(values) {
  const valid = values.filter((v) => v != null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function aggregateWindows(windows, startMs, endMs) {
  const selected = windows.filter((w) => w.endMs > startMs && w.startMs < endMs);
  const metrics = {};
  for (const key of METRIC_KEYS) {
    metrics[key] = mean(selected.map((w) => w.metrics[key]));
    if (metrics[key] != null) metrics[key] = Math.round(metrics[key]);
  }
  return metrics;
}

export function rangeStats(windows, startMs, endMs, overall) {
  const metrics = aggregateWindows(windows, startMs, endMs);
  const deltas = {};
  for (const key of METRIC_KEYS) {
    const local = metrics[key];
    const base = overall[key];
    deltas[key] = local == null || base == null ? null : Math.round(local - base);
  }
  return { durationMs: Math.max(0, endMs - startMs), metrics, deltas };
}
