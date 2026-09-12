"use client";

import { useMemo, useState } from "react";
import { formatClock } from "@/lib/analysis/format";
import type { FrameAnalysis } from "@/lib/types/analysis";

export function FacialSignals({
  frames,
  timeMs,
  durationMs,
}: {
  frames: FrameAnalysis[];
  timeMs: number;
  durationMs: number;
}) {
  const names = useMemo(() => {
    const seen = new Set<string>();
    for (const frame of frames) {
      if (!frame.blendshapes) continue;
      for (const name of Object.keys(frame.blendshapes)) seen.add(name);
    }
    return [...seen].sort();
  }, [frames]);

  const ranked = useMemo(() => {
    const stats = names.map((name) => {
      let min = Infinity;
      let max = -Infinity;
      for (const frame of frames) {
        const value = frame.blendshapes?.[name];
        if (value == null) continue;
        min = Math.min(min, value);
        max = Math.max(max, value);
      }
      return { name, range: Number.isFinite(max) ? max - min : 0 };
    });
    stats.sort((a, b) => b.range - a.range);
    return stats;
  }, [frames, names]);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>(() => ranked.slice(0, 4).map((s) => s.name));

  const filtered = ranked.filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <details className="group border-t border-border">
      <summary className="cursor-pointer list-none px-4 py-3 text-[13px] font-medium">
        Facial signals
        <span className="ml-2 text-[11px] font-normal text-muted">
          Low-level blendshape coefficients, not emotion labels
        </span>
      </summary>
      <div className="grid gap-4 px-4 pb-4 md:grid-cols-[220px_1fr]">
        <div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search signals"
            className="mb-2 h-8 w-full rounded-md border border-border bg-card px-2 text-xs"
          />
          <div className="max-h-48 overflow-auto text-[12px]">
            {filtered.map((item) => {
              const on = selected.includes(item.name);
              return (
                <label key={item.name} className="flex cursor-pointer items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setSelected((prev) =>
                        on ? prev.filter((n) => n !== item.name) : [...prev, item.name],
                      )
                    }
                  />
                  <span className="truncate">{item.name}</span>
                </label>
              );
            })}
          </div>
        </div>
        <SignalChart
          frames={frames}
          names={selected}
          timeMs={timeMs}
          durationMs={durationMs}
        />
      </div>
    </details>
  );
}

function SignalChart({
  frames,
  names,
  timeMs,
  durationMs,
}: {
  frames: FrameAnalysis[];
  names: string[];
  timeMs: number;
  durationMs: number;
}) {
  const width = 640;
  const height = 140;
  if (names.length === 0) {
    return <p className="text-[12px] text-muted">Select one or more signals to plot.</p>;
  }
  const palette = ["#171717", "#6f6e69", "#b45309", "#0f7a4a", "#3f3f46", "#b42318"];
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full">
        {names.map((name, i) => {
          let d = "";
          let drawing = false;
          frames.forEach((frame) => {
            const value = frame.blendshapes?.[name];
            if (value == null || durationMs <= 0) {
              drawing = false;
              return;
            }
            const x = (frame.timestampMs / durationMs) * width;
            const y = 8 + (1 - value) * (height - 16);
            d += drawing ? ` L ${x} ${y}` : `M ${x} ${y}`;
            drawing = true;
          });
          return <path key={name} d={d} fill="none" stroke={palette[i % palette.length]} strokeWidth="1.2" />;
        })}
        {durationMs > 0 ? (
          <line
            x1={(timeMs / durationMs) * width}
            x2={(timeMs / durationMs) * width}
            y1="0"
            y2={height}
            stroke="#171717"
            strokeWidth="1"
          />
        ) : null}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted">
        {names.map((name, i) => (
          <span key={name} className="flex items-center gap-1">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: palette[i % palette.length] }} />
            {name}
          </span>
        ))}
        <span className="ml-auto font-mono tabular">{formatClock(timeMs)}</span>
      </div>
    </div>
  );
}
