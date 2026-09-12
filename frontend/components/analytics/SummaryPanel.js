"use client";

import { Card } from "@/components/ui/studio";
import { MetricHint } from "@/components/ui/MetricHint";
import { formatClock, formatPercent, formatScore } from "@/lib/analysis/format";
import { METRIC_KEYS, METRIC_LABELS } from "@/lib/types/analysis";

export function SummaryPanel({ result }) {
  const { summary } = result;
  return (
    <Card title="Delivery summary">
      <div className="grid gap-6 md:grid-cols-2 md:gap-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="grid size-28 shrink-0 place-items-center rounded-full bg-primary/5 ring-8 ring-primary/10">
            <div className="text-center">
              <div className="font-mono text-4xl font-semibold tabular-nums text-primary">
                {formatScore(summary.overall)}
              </div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                Overall
              </div>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            {METRIC_KEYS.map((key) => (
              <div key={key}>
                <div className="flex justify-between text-sm">
                  <span className="inline-flex items-center gap-1 text-slate-600">
                    {METRIC_LABELS[key]}
                    <MetricHint metric={key} side="top" />
                  </span>
                  <span className="font-mono tabular-nums text-slate-900">
                    {formatScore(summary[key])}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(0, Math.min(100, summary[key] ?? 0))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <dl className="flex flex-col gap-3 text-sm">
          <Row label="Strongest interval" value={formatInterval(summary.strongestInterval)} />
          <Row label="Weakest interval" value={formatInterval(summary.weakestInterval)} />
          <Row
            label="Time below gaze threshold"
            value={formatPercent(summary.timeBelowGazeThresholdRatio)}
          />
          <Row
            label="Longest low-expression"
            value={
              summary.longestLowExpressionIntervalMs != null
                ? `${(summary.longestLowExpressionIntervalMs / 1000).toFixed(1)}s`
                : "—"
            }
          />
        </dl>
      </div>
    </Card>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

function formatInterval(interval) {
  return interval
    ? `${formatClock(interval.startMs, false)} – ${formatClock(interval.endMs, false)}`
    : "—";
}
