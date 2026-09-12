import type { WindowAnalysis, WindowMetrics } from "@/lib/types/analysis";
import { METRIC_KEYS } from "@/lib/types/analysis";

export type RangeStats = {
  durationMs: number;
  metrics: WindowMetrics;
  deltas: WindowMetrics;
};

function mean(values: Array<number | null | undefined>): number | null {
  const valid = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

export function aggregateWindows(
  windows: WindowAnalysis[],
  startMs: number,
  endMs: number,
): WindowMetrics {
  const selected = windows.filter((w) => w.endMs > startMs && w.startMs < endMs);
  const metrics = {} as WindowMetrics;
  for (const key of METRIC_KEYS) {
    metrics[key] = mean(selected.map((w) => w.metrics[key]));
    if (metrics[key] != null) metrics[key] = Math.round(metrics[key] as number);
  }
  return metrics;
}

export function rangeStats(
  windows: WindowAnalysis[],
  startMs: number,
  endMs: number,
  overall: WindowMetrics,
): RangeStats {
  const metrics = aggregateWindows(windows, startMs, endMs);
  const deltas = {} as WindowMetrics;
  for (const key of METRIC_KEYS) {
    const local = metrics[key];
    const base = overall[key];
    deltas[key] = local == null || base == null ? null : Math.round(local - base);
  }
  return { durationMs: Math.max(0, endMs - startMs), metrics, deltas };
}
