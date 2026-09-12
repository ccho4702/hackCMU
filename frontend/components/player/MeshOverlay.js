"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { landmarkToScreenPoint } from "@/lib/media/displayRect";
import { connectionsFor, connectionsForRegion } from "@/lib/mesh/connections";

const REGIONS = ["contour", "mouthBrows", "eyes"];

function regionKey(region) {
  if (region === "mouth_brows") return "mouthBrows";
  return region;
}

function severityLevel(severity) {
  return severity === "critical" ? 2 : 1;
}

function strokeFor(level) {
  if (level <= 0.04) return null;
  const t = Math.min(1, level / 2);
  const alpha = 0.36 + 0.22 * t;
  if (level < 1.35) return `rgba(245, 158, 11, ${alpha})`;
  return `rgba(239, 68, 68, ${alpha})`;
}

function strokeWidth(region, level) {
  const t = Math.min(1, level / 2);
  if (region === "eyes") return 1.25 + 0.35 * t;
  if (region === "brows") return 0.9 + 0.25 * t;
  if (region === "mouth") return 1.1 + 0.3 * t;
  return 1.15 + 0.3 * t;
}

export const MeshOverlay = forwardRef(function MeshOverlay({ rect, enabled, mode }, ref) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const alertsRef = useRef([]);
  const enabledRef = useRef(enabled);
  const modeRef = useRef(mode);
  const rectRef = useRef(rect);
  const intensityRef = useRef({
    eyes: 0,
    contour: 0,
    mouthBrows: 0,
  });
  const rafRef = useRef(0);
  useLayoutEffect(() => {
    enabledRef.current = enabled;
    modeRef.current = mode;
    rectRef.current = rect;
  }, [enabled, mode, rect]);

  const targets = useCallback(() => {
    const next = { eyes: 0, contour: 0, mouthBrows: 0 };
    for (const alert of alertsRef.current) {
      const key = regionKey(alert.region);
      if (!(key in next)) continue;
      next[key] = Math.max(next[key], severityLevel(alert.severity));
    }
    return next;
  }, []);

  const paint = useCallback(
    function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const display = rectRef.current;
      const dpr = window.devicePixelRatio || 1;
      const width = display.elementWidth;
      const height = display.elementHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.max(1, Math.round(width * dpr));
        canvas.height = Math.max(1, Math.round(height * dpr));
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const frame = frameRef.current;
      if (!enabledRef.current || !frame?.landmarks || display.width <= 0) return;

      const desired = targets();
      let moving = false;
      for (const region of REGIONS) {
        const current = intensityRef.current[region];
        const next = current + (desired[region] - current) * 0.16;
        intensityRef.current[region] =
          Math.abs(next - desired[region]) < 0.02 ? desired[region] : next;
        if (intensityRef.current[region] !== desired[region]) moving = true;
      }

      const edges = connectionsFor(modeRef.current);
      ctx.strokeStyle = "rgba(143,180,255,0.6)";
      ctx.lineWidth = modeRef.current === "full" ? 0.55 : 1.05;
      ctx.beginPath();
      for (const [a, b] of edges) {
        const pa = frame.landmarks[a];
        const pb = frame.landmarks[b];
        if (!pa || !pb) continue;
        const sa = landmarkToScreenPoint(pa, display);
        const sb = landmarkToScreenPoint(pb, display);
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
      }
      ctx.stroke();

      if (modeRef.current === "eyes" || modeRef.current === "full") {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        for (const index of [468, 473]) {
          const lm = frame.landmarks[index];
          if (!lm) continue;
          const p = landmarkToScreenPoint(lm, display);
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const region of REGIONS) {
        const level = intensityRef.current[region];
        const color = strokeFor(level);
        if (!color) continue;
        ctx.strokeStyle = color;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const parts =
          region === "mouthBrows"
            ? [
                ["brows", connectionsFor("brows")],
                ["mouth", connectionsFor("mouth")],
              ]
            : [[region, connectionsForRegion(region)]];
        for (const [part, edges] of parts) {
          ctx.lineWidth = strokeWidth(part, level);
          ctx.beginPath();
          for (const [a, b] of edges ?? []) {
            const pa = frame.landmarks[a];
            const pb = frame.landmarks[b];
            if (!pa || !pb) continue;
            const sa = landmarkToScreenPoint(pa, display);
            const sb = landmarkToScreenPoint(pb, display);
            ctx.moveTo(sa.x, sa.y);
            ctx.lineTo(sb.x, sb.y);
          }
          ctx.stroke();
        }
        if (region === "eyes") {
          ctx.fillStyle = color;
          const radius = 1.7 + 0.5 * Math.min(1, level / 2);
          for (const index of [468, 473]) {
            const lm = frame.landmarks[index];
            if (!lm) continue;
            const p = landmarkToScreenPoint(lm, display);
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      if (moving) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = requestAnimationFrame(draw);
      }
    },
    [targets],
  );

  useImperativeHandle(ref, () => ({
    draw(frame, alerts = []) {
      frameRef.current = frame;
      alertsRef.current = alerts;
      paint();
    },
  }));

  useEffect(() => {
    paint();
    return () => cancelAnimationFrame(rafRef.current);
  }, [rect, enabled, mode, paint]);

  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0" />;
});
