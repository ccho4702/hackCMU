"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { alertsAt } from "@/lib/analysis/lookup";
import { formatClock, formatScore } from "@/lib/analysis/format";
import {
  DEFAULT_METRIC_THRESHOLDS,
  METRIC_KEYS,
  METRIC_LABELS,
  metricKeyFromAlert,
} from "@/lib/types/analysis";
import { MetricHint } from "@/components/ui/MetricHint";

const LABEL_WIDTH = 124;
const TONE_STROKE = {
  ok: "#2f6bff",
  warning: "#f59e0b",
  critical: "#f43f5e",
};
const CRITICAL_FILL = "rgba(244,63,94,0.12)";

function alertToneAt(alerts, key, ms, now) {
  let tone = "ok";
  for (const alert of alerts) {
    if (metricKeyFromAlert(alert.metric) !== key) continue;
    const endMs = alert.endMs ?? now;
    if (ms < alert.startMs || ms >= endMs) continue;
    if (alert.severity === "critical") return "critical";
    tone = "warning";
  }
  return tone;
}

function timeToX(ms, duration, width) {
  if (duration <= 0) return 0;
  return (ms / duration) * width;
}

function xToTime(x, duration, width) {
  if (width <= 0) return 0;
  return Math.max(0, Math.min(duration, (x / width) * duration));
}

function clampBand(x0, x1, plotX, plotW) {
  const left = plotX;
  const right = plotX + plotW;
  const a = Math.max(left, Math.min(right, x0));
  const b = Math.max(left, Math.min(right, x1));
  if (b <= a) return null;
  return [a, b];
}

export const Timeline = forwardRef(function Timeline(
  {
    durationMs,
    windows,
    segments: _segments,
    selection,
    onSeek,
    onSelect,
    viewStartMs = 0,
    interactive = true,
    alerts = [],
    thresholds: _thresholds = DEFAULT_METRIC_THRESHOLDS,
  },
  ref,
) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const timeRef = useRef(0);
  const dragRef = useRef(null);
  const [hover, setHover] = useState(null);

  const tracks = useMemo(() => METRIC_KEYS, []);

  const paint = useCallback(() => {
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

    const plotX = LABEL_WIDTH;
    const plotW = Math.max(1, width - LABEL_WIDTH - 12);
    const trackH = height / tracks.length;
    const now = timeRef.current;

    if (selection) {
      const x0 =
        plotX +
        timeToX(Math.min(selection.startMs, selection.endMs) - viewStartMs, durationMs, plotW);
      const x1 =
        plotX +
        timeToX(Math.max(selection.startMs, selection.endMs) - viewStartMs, durationMs, plotW);
      ctx.fillStyle = "rgba(47,107,255,0.08)";
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height);
    }

    tracks.forEach((key, i) => {
      const y0 = i * trackH;

      ctx.strokeStyle = "#eef2f7";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plotX, y0 + trackH);
      ctx.lineTo(width, y0 + trackH);
      ctx.stroke();

      alerts.forEach((alert) => {
        if (metricKeyFromAlert(alert.metric) !== key) return;
        if (alert.severity !== "critical") return;
        const endMs = alert.endMs ?? now;
        const band = clampBand(
          plotX + timeToX(alert.startMs - viewStartMs, durationMs, plotW),
          plotX + timeToX(endMs - viewStartMs, durationMs, plotW),
          plotX,
          plotW,
        );
        if (!band) return;
        const [x0, x1] = band;
        ctx.fillStyle = CRITICAL_FILL;
        ctx.fillRect(x0, y0 + 1, Math.max(2, x1 - x0), trackH - 2);
      });

      const points = [];
      windows.forEach((window) => {
        const value = window.metrics[key];
        if (value == null) {
          points.push(null);
          return;
        }
        const mid = (window.startMs + window.endMs) / 2;
        points.push({
          x: plotX + timeToX(mid - viewStartMs, durationMs, plotW),
          y: y0 + 10 + (1 - value / 100) * (trackH - 20),
          ms: mid,
        });
      });

      ctx.lineWidth = 1.75;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      for (let p = 1; p < points.length; p += 1) {
        const prev = points[p - 1];
        const curr = points[p];
        if (!prev || !curr) continue;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(curr.x, curr.y);
        ctx.strokeStyle = TONE_STROKE[alertToneAt(alerts, key, curr.ms, now)];
        ctx.stroke();
      }
    });

    const playX = plotX + timeToX(timeRef.current - viewStartMs, durationMs, plotW);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(playX + 0.5, 0);
    ctx.lineTo(playX + 0.5, height);
    ctx.stroke();
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.moveTo(playX - 4, 0);
    ctx.lineTo(playX + 4, 0);
    ctx.lineTo(playX, 7);
    ctx.closePath();
    ctx.fill();
  }, [alerts, durationMs, selection, tracks, viewStartMs, windows]);

  useImperativeHandle(ref, () => ({
    draw(timeMs) {
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
  }, [paint]);

  const pointerTime = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left - LABEL_WIDTH;
    const plotW = Math.max(1, bounds.width - LABEL_WIDTH - 12);
    return viewStartMs + xToTime(x, durationMs, plotW);
  };

  return (
    <div>
      <div ref={wrapRef} className="relative h-[280px] w-full">
        <canvas
          ref={canvasRef}
          className={interactive ? "h-full w-full cursor-crosshair" : "h-full w-full"}
          onPointerDown={(event) => {
            if (!interactive) return;
            const bounds = event.target.getBoundingClientRect();
            if (event.clientX - bounds.left < LABEL_WIDTH) return;
            event.target.setPointerCapture(event.pointerId);
            const ms = pointerTime(event);
            dragRef.current = { origin: ms, moved: false };
            onSeek(ms);
          }}
          onPointerMove={(event) => {
            const bounds = event.target.getBoundingClientRect();
            if (event.clientX - bounds.left < LABEL_WIDTH) {
              if (!dragRef.current) setHover(null);
              return;
            }
            const ms = pointerTime(event);
            const window = windows.find((w) => ms >= w.startMs && ms < w.endMs);
            setHover({
              left: event.clientX - bounds.left,
              ms,
              scores: {
                gaze: window?.metrics.gaze ?? null,
                expressionActivity: window?.metrics.expressionActivity ?? null,
                stability: window?.metrics.stability ?? null,
                expressiveness: window?.metrics.expressiveness ?? null,
              },
              warnings: alertsAt(alerts, ms),
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
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-[124px]">
          {METRIC_KEYS.map((key, i) => (
            <div
              key={key}
              className="absolute left-0 flex items-center gap-0.5 pr-2"
              style={{
                top: `${((i + 0.5) / METRIC_KEYS.length) * 100}%`,
                transform: "translateY(-50%)",
              }}
            >
              <span className="text-[11px] text-slate-500">{METRIC_LABELS[key]}</span>
              <span className="pointer-events-auto">
                <MetricHint metric={key} side="right" />
              </span>
            </div>
          ))}
        </div>
        {hover ? (
          <div
            className="pointer-events-none absolute top-2 z-20 w-[200px] rounded-xl bg-white px-3 py-2 text-[11px] shadow-lg ring-1 ring-slate-200"
            style={{
              left: Math.min(Math.max(hover.left, 128), (wrapRef.current?.clientWidth ?? 400) - 208),
            }}
          >
            <div className="mb-1 font-mono font-semibold tabular-nums text-slate-900">
              {formatClock(hover.ms)}
            </div>
            {METRIC_KEYS.map((key) => (
              <div key={key} className="flex justify-between gap-6 text-slate-500">
                <span>{METRIC_LABELS[key]}</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {formatScore(hover.scores[key])}
                </span>
              </div>
            ))}
            {hover.warnings.length ? (
              <div className="mt-1.5 space-y-0.5 border-t border-slate-100 pt-1.5">
                {hover.warnings.map((alert) => (
                  <div key={alert.id} className="flex items-start gap-1.5">
                    <span
                      className="mt-1 size-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          alert.severity === "critical" ? TONE_STROKE.critical : TONE_STROKE.warning,
                      }}
                    />
                    <span
                      className={
                        alert.severity === "critical" ? "text-rose-600" : "text-amber-600"
                      }
                    >
                      {alert.message}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-primary" />
          Score
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-amber-400" />
          Warning
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-rose-400" />
          Critical
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-rose-400/30" />
          Critical range
        </span>
        <span>Hover the plot for the message.</span>
      </div>
    </div>
  );
});
