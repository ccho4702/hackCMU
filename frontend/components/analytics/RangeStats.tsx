"use client";

import { formatClock, formatDelta, formatDuration, formatScore } from "@/lib/analysis/format";
import { rangeStats, type RangeStats } from "@/lib/analysis/aggregate";
import type { AnalysisSummary, WindowAnalysis } from "@/lib/types/analysis";
import { METRIC_KEYS, METRIC_LABELS } from "@/lib/types/analysis";
import type { TimelineSelection } from "@/components/analytics/Timeline";

export function RangeStatsPanel({
  selection,
  windows,
  summary,
  onClear,
}: {
  selection: TimelineSelection;
  windows: WindowAnalysis[];
  summary: AnalysisSummary;
  onClear: () => void;
}) {
  if (!selection) {
    return (
      <p className="text-[12px] text-muted">
        Drag on the timeline to select an interval. Click seeks the playhead.
      </p>
    );
  }
  const stats: RangeStats = rangeStats(windows, selection.startMs, selection.endMs, {
    gaze: summary.gaze,
    expressionActivity: summary.expressionActivity,
    stability: summary.stability,
    expressiveness: summary.expressiveness,
  });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Selected segment</div>
        <button type="button" className="text-[11px] text-muted hover:text-foreground" onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="font-mono text-sm tabular">
        {formatClock(selection.startMs)} → {formatClock(selection.endMs)}
      </div>
      <div className="mt-1 text-[12px] text-muted">{formatDuration(stats.durationMs)}</div>
      <div className="mt-3 grid grid-cols-2 gap-x-6">
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Selection</div>
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted">vs. entire video</div>
        {METRIC_KEYS.map((key) => (
          <div key={key} className="contents">
            <div className="flex justify-between py-0.5 text-[13px]">
              <span className="text-muted">{METRIC_LABELS[key]}</span>
              <span className="font-mono tabular">{formatScore(stats.metrics[key])}</span>
            </div>
            <div className="flex justify-end py-0.5 font-mono text-[13px] tabular">
              {formatDelta(stats.deltas[key])}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
