"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/studio";
import { formatClock } from "@/lib/analysis/format";

export function SegmentList({ title, segments, onSeek }) {
  return (
    <Card title={title} className="min-w-0">
      {segments.length === 0 ? (
        <p className="text-xs text-slate-400">None detected</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {segments.map((segment) => (
            <li key={segment.id}>
              <button
                type="button"
                onClick={() => onSeek(segment.startMs)}
                className="flex w-full items-center justify-between gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white"
              >
                <span className="truncate text-sm text-slate-700">{segmentLabel(segment.type)}</span>
                <span className="flex shrink-0 items-center gap-2">
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
                  <span className="font-mono text-xs tabular-nums text-slate-400">
                    {formatClock(segment.startMs, false)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// "LOW_EXPRESSION_ACTIVITY" -> "Low expression activity"
function segmentLabel(type) {
  const text = type.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
