"use client";

import { formatClock, formatDegrees, formatScore, unavailableReason } from "@/lib/analysis/format";
import type { DeliveryAlert, FrameAnalysis, MetricKey, WindowAnalysis } from "@/lib/types/analysis";
import { METRIC_KEYS, METRIC_LABELS } from "@/lib/types/analysis";
import { cn } from "@/lib/utils";

function MetricRow({
  label,
  value,
  unavailable,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  unavailable?: string | null;
  tone?: "warning" | "critical" | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-[13px] text-muted">{label}</span>
      {value == null ? (
        <span className="text-right text-[11px] text-muted">{unavailable ?? "Measurement unavailable"}</span>
      ) : (
        <span
          className={cn(
            "font-mono text-[15px] tabular",
            tone === "critical" && "text-critical",
            tone === "warning" && "text-warning",
          )}
        >
          {formatScore(value)}
        </span>
      )}
    </div>
  );
}

export function MomentInspector({
  timeMs,
  window,
  frame,
  alerts = [],
  live = false,
}: {
  timeMs: number;
  window: WindowAnalysis | null;
  frame: FrameAnalysis | null;
  alerts?: DeliveryAlert[];
  live?: boolean;
}) {
  const faceDetected = frame?.quality.faceDetected ?? false;
  const gazeValid = frame?.quality.gazeValid ?? false;
  const tones = Object.fromEntries(alerts.map((alert) => [alert.metric, alert.severity])) as Partial<
    Record<MetricKey, "warning" | "critical">
  >;

  const blendshapes = frame?.blendshapes
    ? Object.entries(frame.blendshapes)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
    : [];

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-auto bg-card">
      <div className="border-b border-border px-4 py-3">
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted">
          {live ? "Live camera" : "Current moment"}
        </div>
        <div className="mt-1 font-mono text-lg tabular">{formatClock(timeMs)}</div>
      </div>
      <div className="border-b border-border px-4 py-3">
        {METRIC_KEYS.map((key: MetricKey) => (
          <MetricRow
            key={key}
            label={METRIC_LABELS[key]}
            value={window?.metrics[key]}
            unavailable={unavailableReason(key, faceDetected, gazeValid)}
            tone={tones[key] ?? null}
          />
        ))}
      </div>
      <div className="border-b border-border px-4 py-3">
        <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-muted">Head</div>
        <MetricLine label="Yaw" value={formatDegrees(frame?.headPose?.yawDeg)} />
        <MetricLine label="Pitch" value={formatDegrees(frame?.headPose?.pitchDeg)} />
        <MetricLine label="Roll" value={formatDegrees(frame?.headPose?.rollDeg)} />
      </div>
      <div className="px-4 py-3">
        <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-muted">
          Dominant facial signals
        </div>
        {blendshapes.length === 0 ? (
          <p className="text-[12px] text-muted">No blendshape sample at this time.</p>
        ) : (
          blendshapes.map(([name, value]) => (
            <MetricLine key={name} label={name} value={value.toFixed(2)} mono />
          ))
        )}
      </div>
    </aside>
  );
}

function MetricLine({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="truncate text-[12px] text-muted">{label}</span>
      <span className={mono ? "font-mono text-[12px] tabular" : "text-[12px]"}>{value}</span>
    </div>
  );
}
