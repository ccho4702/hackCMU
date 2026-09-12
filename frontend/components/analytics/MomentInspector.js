"use client";

import { Card, StatTile } from "@/components/ui/studio";
import { MetricHint } from "@/components/ui/MetricHint";
import { formatClock, formatDegrees, formatScore, unavailableReason } from "@/lib/analysis/format";
import { METRIC_KEYS, METRIC_LABELS, metricKeyFromAlert } from "@/lib/types/analysis";
import { cn } from "@/lib/utils";

const TONE_BAR = {
  critical: "bg-rose-500",
  warning: "bg-amber-500",
};

const TONE_TEXT = {
  critical: "text-rose-600",
  warning: "text-amber-600",
};

function MetricRow({ label, metric, value, unavailable, tone }) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between gap-4">
        <span className="inline-flex items-center gap-1 text-sm text-slate-600">
          {label}
          <MetricHint metric={metric} side="top" />
        </span>
        {value == null ? (
          <span className="text-right text-xs text-slate-400">
            {unavailable ?? "Measurement unavailable"}
          </span>
        ) : (
          <span className={cn("font-mono text-base font-semibold tabular-nums", TONE_TEXT[tone])}>
            {formatScore(value)}
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className={cn("h-full rounded-full transition-[width] duration-300", TONE_BAR[tone] ?? "bg-primary")}
          style={{ width: `${Math.max(0, Math.min(100, value ?? 0))}%` }}
        />
      </div>
    </div>
  );
}

// Per-moment metrics, rendered as a stack of cards for the side panel.
export function MomentInspector({
  timeMs,
  window,
  frame,
  alerts = [],
  live = false,
  showSignals = true,
}) {
  const faceDetected = frame?.quality.faceDetected ?? false;
  const gazeValid = frame?.quality.gazeValid ?? false;
  const tones = Object.fromEntries(
    alerts.map((alert) => [metricKeyFromAlert(alert.metric), alert.severity]),
  );

  const blendshapes = frame?.blendshapes
    ? Object.entries(frame.blendshapes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
    : [];

  return (
    <>
      <Card
        title={live ? "Live metrics" : "Current moment"}
        action={<span className="font-mono text-sm tabular-nums text-slate-900">{formatClock(timeMs)}</span>}
      >
        {METRIC_KEYS.map((key) => (
          <MetricRow
            key={key}
            metric={key}
            label={METRIC_LABELS[key]}
            value={window?.metrics[key]}
            unavailable={unavailableReason(key, faceDetected, gazeValid)}
            tone={tones[key] ?? null}
          />
        ))}
      </Card>

      <Card title="Head pose">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Yaw" value={formatDegrees(frame?.headPose?.yawDeg)} />
          <StatTile label="Pitch" value={formatDegrees(frame?.headPose?.pitchDeg)} />
          <StatTile label="Roll" value={formatDegrees(frame?.headPose?.rollDeg)} />
        </div>
      </Card>

      {showSignals ? (
        <Card title="Dominant facial signals">
          {blendshapes.length === 0 ? (
            <p className="text-xs text-slate-400">No blendshape sample at this time.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {blendshapes.map(([name, value]) => (
                <li key={name}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate text-slate-600">{name}</span>
                    <span className="font-mono tabular-nums text-slate-900">{value.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-[#8fb4ff]" style={{ width: `${value * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}
    </>
  );
}
