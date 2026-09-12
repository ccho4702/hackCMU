"use client";

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { formatClock, formatScore } from "@/lib/analysis/format";
import type { AnalysisSegment, MetricKey, WindowAnalysis } from "@/lib/types/analysis";
import { METRIC_KEYS, METRIC_LABELS } from "@/lib/types/analysis";

export type TimelineHandle = {
  draw: (timeMs: number) => void;
};

export type TimelineSelection = { startMs: number; endMs: number } | null;

function timeToX(ms: number, duration: number, width: number) {
  if (duration <= 0) return 0;
  return (ms / duration) * width;
}

function xToTime(x: number, duration: number, width: number) {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(duration, (x / width) * duration));
}

export const Timeline = forwardRef<
  TimelineHandle,
  {
    durationMs: number;
    windows: WindowAnalysis[];
    segments: AnalysisSegment[];
    selection: TimelineSelection;
    onSeek: (ms: number) => void;
    onSelect: (selection: TimelineSelection) => void;
    viewStartMs?: number;
    interactive?: boolean;
  }
>(function Timeline(
  {
    durationMs,
    windows,
    segments,
    selection,
    onSeek,
    onSelect,
    viewStartMs = 0,
    interactive = true,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const dragRef = useRef<{ origin: number; moved: boolean } | null>(null);
  const [hover, setHover] = useState<{
    left: number;
    ms: number;
    scores: Partial<Record<MetricKey, number | null>>;
  } | null>(null);

  const tracks = useMemo(() => METRIC_KEYS, []);

  const paint = () => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const width = wrap.clientWidth;
    const height = wrap.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const labelWidth = 108;
    const plotX = labelWidth;
    const plotW = Math.max(1, width - labelWidth - 12);
    const trackH = height / tracks.length;

    segments.forEach((segment) => {
      const x0 = plotX + timeToX(segment.startMs - viewStartMs, durationMs, plotW);
      const x1 = plotX + timeToX(segment.endMs - viewStartMs, durationMs, plotW);
      ctx.fillStyle =
        segment.kind === "strong"
          ? "rgba(15,122,74,0.08)"
          : segment.severity === "critical"
            ? "rgba(180,35,24,0.10)"
            : "rgba(180,83,9,0.10)";
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height);
    });

    if (selection) {
      const x0 = plotX + timeToX(Math.min(selection.startMs, selection.endMs) - viewStartMs, durationMs, plotW);
      const x1 = plotX + timeToX(Math.max(selection.startMs, selection.endMs) - viewStartMs, durationMs, plotW);
      ctx.fillStyle = "rgba(23,23,23,0.06)";
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height);
    }

    tracks.forEach((key, i) => {
      const y0 = i * trackH;
      ctx.fillStyle = "#6f6e69";
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.textBaseline = "middle";
      ctx.fillText(METRIC_LABELS[key], 8, y0 + trackH / 2);

      ctx.strokeStyle = "#ecece8";
      ctx.beginPath();
      ctx.moveTo(plotX, y0 + trackH);
      ctx.lineTo(width, y0 + trackH);
      ctx.stroke();

      ctx.beginPath();
      let drawing = false;
      windows.forEach((window) => {
        const value = window.metrics[key];
        if (value == null) {
          drawing = false;
          return;
        }
        const x = plotX + timeToX((window.startMs + window.endMs) / 2 - viewStartMs, durationMs, plotW);
        const y = y0 + 8 + (1 - value / 100) * (trackH - 16);
        if (!drawing) {
          ctx.moveTo(x, y);
          drawing = true;
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.strokeStyle = "#171717";
      ctx.lineWidth = 1.25;
      ctx.stroke();
    });

    const playX = plotX + timeToX(timeRef.current - viewStartMs, durationMs, plotW);
    ctx.strokeStyle = "#171717";
    ctx.beginPath();
    ctx.moveTo(playX + 0.5, 0);
    ctx.lineTo(playX + 0.5, height);
    ctx.stroke();
    ctx.fillStyle = "#171717";
    ctx.beginPath();
    ctx.moveTo(playX - 4, 0);
    ctx.lineTo(playX + 4, 0);
    ctx.lineTo(playX, 7);
    ctx.closePath();
    ctx.fill();
  };

  useImperativeHandle(ref, () => ({
    draw(timeMs: number) {
      timeRef.current = timeMs;
      paint();
    },
  }));

  useEffect(() => {
    paint();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(() => paint());
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [durationMs, windows, segments, selection, viewStartMs]);

  const pointerTime = (event: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const bounds = canvas.getBoundingClientRect();
    const labelWidth = 108;
    const x = event.clientX - bounds.left - labelWidth;
    const plotW = Math.max(1, bounds.width - labelWidth - 12);
    return viewStartMs + xToTime(x, durationMs, plotW);
  };

  return (
    <div ref={wrapRef} className="relative h-[168px] w-full">
      <canvas
        ref={canvasRef}
        className={interactive ? "h-full w-full cursor-crosshair" : "h-full w-full"}
        onPointerDown={(event) => {
          if (!interactive) return;
          (event.target as HTMLCanvasElement).setPointerCapture(event.pointerId);
          const ms = pointerTime(event);
          dragRef.current = { origin: ms, moved: false };
          onSeek(ms);
        }}
        onPointerMove={(event) => {
          const ms = pointerTime(event);
          const window = windows.find((w) => ms >= w.startMs && ms < w.endMs);
          const bounds = (event.target as HTMLCanvasElement).getBoundingClientRect();
          setHover({
            left: event.clientX - bounds.left,
            ms,
            scores: {
              gaze: window?.metrics.gaze ?? null,
              expressionActivity: window?.metrics.expressionActivity ?? null,
              stability: window?.metrics.stability ?? null,
              expressiveness: window?.metrics.expressiveness ?? null,
            },
          });
          const drag = dragRef.current;
          if (drag) {
            if (Math.abs(ms - drag.origin) > 60) drag.moved = true;
            if (drag.moved) {
              onSelect({ startMs: Math.min(drag.origin, ms), endMs: Math.max(drag.origin, ms) });
            } else {
              onSeek(ms);
            }
          }
        }}
        onPointerUp={(event) => {
          const drag = dragRef.current;
          const ms = pointerTime(event);
          if (drag?.moved) {
            onSelect({ startMs: Math.min(drag.origin, ms), endMs: Math.max(drag.origin, ms) });
          }
          dragRef.current = null;
        }}
        onPointerLeave={() => {
          if (!dragRef.current) setHover(null);
        }}
      />
      {hover ? (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-card px-2 py-1.5 text-[11px] shadow-sm"
          style={{ left: Math.min(Math.max(hover.left, 116), (wrapRef.current?.clientWidth ?? 400) - 160) }}
        >
          <div className="font-mono tabular">{formatClock(hover.ms)}</div>
          {METRIC_KEYS.map((key) => (
            <div key={key} className="flex justify-between gap-6 text-muted">
              <span>{METRIC_LABELS[key]}</span>
              <span className="font-mono tabular text-foreground">{formatScore(hover.scores[key])}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});
