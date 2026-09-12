"use client";

import { useEffect, useId, useState } from "react";
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
          <ScoreRing value={summary.overall} />
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
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200/70">
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

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;
const RING_DURATION_MS = 1200;

// Overall score with a navy → primary gradient ring that fills up (and counts up) on mount.
function ScoreRing({ value }) {
  const target = value == null || Number.isNaN(value) ? null : Math.max(0, Math.min(100, value));
  const gradientId = `score-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (target == null) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    let frame;
    function tick(now) {
      const t = reduceMotion ? 1 : Math.min(1, (now - start) / RING_DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setProgress(target * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return (
    <div className="relative grid size-32 shrink-0 place-items-center">
      <svg
        viewBox="0 0 120 120"
        className="absolute inset-0 size-full -rotate-90 drop-shadow-[0_6px_14px_rgba(47,107,255,0.25)]"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#172554" />
            <stop offset="100%" stopColor="#2f6bff" />
          </linearGradient>
        </defs>
        <circle cx="60" cy="60" r={RING_RADIUS} fill="none" stroke="#e2e8f5" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={RING_RADIUS}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - progress / 100)}
          opacity={target == null ? 0 : 1}
        />
      </svg>
      <div className="relative text-center">
        <div className="font-mono text-4xl font-semibold tabular-nums text-primary">
          {target == null ? "—" : Math.round(progress)}
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          Overall
        </div>
      </div>
    </div>
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
