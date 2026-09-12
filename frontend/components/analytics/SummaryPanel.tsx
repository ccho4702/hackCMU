"use client";

import { formatClock, formatPercent, formatScore } from "@/lib/analysis/format";
import type { AnalysisResult } from "@/lib/types/analysis";
import { METRIC_KEYS, METRIC_LABELS } from "@/lib/types/analysis";

export function SummaryPanel({ result }: { result: AnalysisResult }) {
  const { summary, quality } = result;
  return (
    <section className="grid gap-4 md:grid-cols-3">
      <div>
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Delivery analysis</div>
        <div className="mt-2 flex items-end gap-3">
          <span className="font-mono text-3xl tabular">{formatScore(summary.overall)}</span>
          <span className="mb-1 text-xs text-muted">overall</span>
        </div>
        <div className="mt-3 space-y-1">
          {METRIC_KEYS.map((key) => (
            <div key={key} className="flex justify-between text-[13px]">
              <span className="text-muted">{METRIC_LABELS[key]}</span>
              <span className="font-mono tabular">{formatScore(summary[key])}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3 text-[13px]">
        <Interval label="Strongest interval" interval={summary.strongestInterval} />
        <Interval label="Weakest interval" interval={summary.weakestInterval} />
        <div className="flex justify-between">
          <span className="text-muted">Time below gaze threshold</span>
          <span className="font-mono tabular">{formatPercent(summary.timeBelowGazeThresholdRatio)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Longest low-expression</span>
          <span className="font-mono tabular">
            {summary.longestLowExpressionIntervalMs != null
              ? `${(summary.longestLowExpressionIntervalMs / 1000).toFixed(1)}s`
              : "—"}
          </span>
        </div>
      </div>
      <div className="space-y-3 text-[13px]">
        <div className="flex justify-between">
          <span className="text-muted">Valid face coverage</span>
          <span className="font-mono tabular">{formatPercent(quality.validFaceCoverage)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Valid gaze coverage</span>
          <span className="font-mono tabular">{formatPercent(quality.validGazeCoverage)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted">Sampled frames</span>
          <span className="font-mono tabular">{quality.sampledFrameCount}</span>
        </div>
        <p className="text-[11px] leading-relaxed text-muted">
          Scores are presentation-delivery heuristics on observable geometry, not emotion,
          personality, or confidence as a trait.
        </p>
      </div>
    </section>
  );
}

function Interval({
  label,
  interval,
}: {
  label: string;
  interval: { startMs: number; endMs: number } | null;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className="font-mono tabular">
        {interval ? `${formatClock(interval.startMs, false)} – ${formatClock(interval.endMs, false)}` : "—"}
      </span>
    </div>
  );
}
