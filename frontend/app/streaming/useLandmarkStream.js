"use client";

import { useEffect, useRef, useState } from "react";

// Same-origin URL; Next rewrites /api/* (WebSocket included) to FastAPI.
const WS_PATH = "/api/ws/landmarks";
const TARGET_FPS = 15;
const CAPTURE_WIDTH = 640; // frames are downscaled before sending
const JPEG_QUALITY = 0.7;
const FRAME_TIMEOUT_MS = 2000; // give up on a frame the server never answered

/**
 * While `enabled`, streams webcam frames to the backend and returns the latest
 * MediaPipe result. Only one frame is in flight at a time, so a slow backend
 * lowers the frame rate instead of building up a queue.
 *
 * status: "off" | "connecting" | "connected" | "disconnected"
 */
export function useLandmarkStream(videoRef, enabled) {
  const [status, setStatus] = useState("off");
  const [result, setResult] = useState(null);
  const [stats, setStats] = useState({ fps: 0, latency: 0 });
  const statsRef = useRef({ fps: 0, latency: 0, lastAt: 0 });

  useEffect(() => {
    if (!enabled) return;

    let ws;
    let rafId;
    let retryTimer;
    let retryDelay = 1000;
    let closed = false;
    let inFlight = false;
    let sentAt = 0;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    function connect() {
      setStatus("connecting");
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${proto}//${location.host}${WS_PATH}`);
      ws.binaryType = "arraybuffer";

      ws.onopen = () => {
        setStatus("connected");
        retryDelay = 1000;
        inFlight = false;
      };

      ws.onmessage = (e) => {
        const now = performance.now();
        const s = statsRef.current;
        // Exponential moving averages keep the numbers readable
        s.latency = s.latency ? s.latency * 0.8 + (now - sentAt) * 0.2 : now - sentAt;
        if (s.lastAt) s.fps = s.fps * 0.8 + (1000 / (now - s.lastAt)) * 0.2;
        s.lastAt = now;
        inFlight = false;

        setResult(JSON.parse(e.data));
        setStats({ fps: s.fps, latency: s.latency });
      };

      ws.onclose = () => {
        if (closed) return;
        setStatus("disconnected");
        retryTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 5000);
      };
    }

    function tick() {
      rafId = requestAnimationFrame(tick);
      const video = videoRef.current;
      const now = performance.now();

      if (inFlight && now - sentAt > FRAME_TIMEOUT_MS) inFlight = false;
      if (inFlight || ws?.readyState !== WebSocket.OPEN) return;
      if (!video?.videoWidth || now - sentAt < 1000 / TARGET_FPS) return;

      canvas.width = Math.min(CAPTURE_WIDTH, video.videoWidth);
      canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      inFlight = true;
      sentAt = now;
      canvas.toBlob(
        (blob) => {
          if (blob && ws.readyState === WebSocket.OPEN) ws.send(blob);
          else inFlight = false;
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    }

    connect();
    rafId = requestAnimationFrame(tick);

    return () => {
      closed = true;
      cancelAnimationFrame(rafId);
      clearTimeout(retryTimer);
      ws?.close();
      statsRef.current = { fps: 0, latency: 0, lastAt: 0 };
      setStatus("off");
      setResult(null);
      setStats({ fps: 0, latency: 0 });
    };
  }, [enabled, videoRef]);

  return { status, result, stats };
}
