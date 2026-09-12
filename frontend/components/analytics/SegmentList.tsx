"use client";

import { formatClock } from "@/lib/analysis/format";
import { Badge } from "@/components/ui/badge";
import type { AnalysisSegment } from "@/lib/types/analysis";

export function SegmentList({
  title,
  segments,
  onSeek,
}: {
  title: string;
  segments: AnalysisSegment[];
  onSeek: (ms: number) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-muted">{title}</div>
      {segments.length === 0 ? (
        <p className="text-[12px] text-muted">None detected</p>
      ) : (
        <ul className="space-y-1">
          {segments.map((segment) => (
            <li key={segment.id}>
              <button
                type="button"
                onClick={() => onSeek(segment.startMs)}
                className="flex w-full items-center justify-between gap-2 rounded-md px-1.5 py-1 text-left hover:bg-track"
              >
                <span className="truncate text-[12px]">{segment.type.replaceAll("_", " ")}</span>
                <span className="flex items-center gap-2">
                  <Badge
                    tone={
                      segment.kind === "strong"
                        ? "strong"
                        : segment.severity === "critical"
                          ? "critical"
                          : "warning"
                    }
                  >
                    {segment.severity}
                  </Badge>
                  <span className="font-mono text-[11px] tabular text-muted">
                    {formatClock(segment.startMs, false)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
