"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { LAYERS, countLandmarks, drawLandmarks } from "./drawLandmarks";
import { useLandmarkStream } from "./useLandmarkStream";
import { useWebcam } from "./useWebcam";

const CAMERA_STATUS = {
  idle: { text: "Off", tone: "off" },
  starting: { text: "Starting", tone: "pending" },
  live: { text: "Live", tone: "ok" },
  error: { text: "Error", tone: "error" },
};

const SERVER_STATUS = {
  off: { text: "Off", tone: "off" },
  connecting: { text: "Connecting", tone: "pending" },
  connected: { text: "Connected", tone: "ok" },
  disconnected: { text: "Reconnecting", tone: "error" },
};

const TONE_DOT = {
  off: "bg-slate-300",
  pending: "bg-amber-400 animate-pulse",
  ok: "bg-emerald-500",
  error: "bg-rose-500",
};

export default function StreamingPage() {
  const { videoRef, status: cameraStatus, error, start, stop } = useWebcam();
  const live = cameraStatus === "live";
  const { status: serverStatus, result, stats } = useLandmarkStream(videoRef, live);

  const canvasRef = useRef(null);
  const [maskOn, setMaskOn] = useState(true);
  const [layers, setLayers] = useState({ pose: true, face: true, hands: true });

  function syncCanvasSize() {
    const video = videoRef.current;
    canvasRef.current.width = video.videoWidth;
    canvasRef.current.height = video.videoHeight;
  }

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawLandmarks(ctx, maskOn ? result : null, layers);
  }, [result, layers, maskOn]);

  const counts = countLandmarks(result);
  const nothingDetected =
    serverStatus === "connected" && result && !counts.pose && !counts.face && !counts.hands;

  return (
    <div className="min-h-screen bg-[#f4f7ff] font-sans text-slate-900">
      <header className="sticky top-0 z-10 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              aria-label="Back to home"
              className="grid size-9 place-items-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeftIcon />
            </Link>
            <div>
              <h1 className="text-base font-semibold leading-tight">Live Session</h1>
              <p className="text-xs text-slate-500">Real-time pose &amp; face tracking</p>
            </div>
          </div>
          <div className="flex gap-2">
            <StatusPill label="Camera" {...CAMERA_STATUS[cameraStatus]} />
            <StatusPill label="Server" {...SERVER_STATUS[serverStatus]} />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* ---------- Camera stage ---------- */}
        <section className="relative aspect-video overflow-hidden rounded-3xl bg-slate-950 shadow-xl shadow-primary/10 ring-1 ring-slate-900/5">
          {/* Mirrored like a selfie view; video and mask flip together so they stay aligned */}
          <div className="absolute inset-0 -scale-x-100">
            <video
              ref={videoRef}
              onLoadedMetadata={syncCanvasSize}
              playsInline
              muted
              className={`size-full object-contain transition-opacity duration-500 ${live ? "opacity-100" : "opacity-0"}`}
            />
            <canvas
              ref={canvasRef}
              className="pointer-events-none absolute inset-0 size-full object-contain"
            />
          </div>

          {!live && (
            <EmptyState starting={cameraStatus === "starting"} error={error} onStart={start} />
          )}

          {live && (
            <>
              <div className="absolute left-4 top-4 flex items-center gap-2 rounded-full bg-black/40 px-3 py-1.5 text-xs font-semibold tracking-wide text-white backdrop-blur">
                <span className="size-2 animate-pulse rounded-full bg-rose-500" />
                LIVE
              </div>
              <div className="absolute right-4 top-4 rounded-full bg-black/40 px-3 py-1.5 font-mono text-xs text-white/90 backdrop-blur">
                {Math.round(stats.fps)} fps · {Math.round(stats.latency)} ms
              </div>

              <div className="absolute inset-x-0 bottom-3 flex justify-center sm:bottom-5">
                <div className="flex items-center gap-1.5 rounded-full bg-black/45 p-1 backdrop-blur-md sm:p-1.5">
                  <button
                    onClick={() => setMaskOn((v) => !v)}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors sm:px-4 sm:py-2 sm:text-sm ${
                      maskOn ? "bg-primary text-white hover:bg-primary-hover" : "text-white/80 hover:bg-white/10"
                    }`}
                  >
                    <SparkIcon />
                    Mask {maskOn ? "on" : "off"}
                  </button>
                  <button
                    onClick={stop}
                    className="flex items-center gap-2 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-rose-600 sm:px-4 sm:py-2 sm:text-sm"
                  >
                    <StopIcon />
                    Stop
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        {/* ---------- Side panel ---------- */}
        <aside className="flex flex-col gap-4">
          <Card
            title="Overlay"
            action={<Switch checked={maskOn} onChange={setMaskOn} label="Show mask" />}
          >
            <ul className={`flex flex-col gap-1 transition-opacity ${maskOn ? "" : "opacity-40"}`}>
              {Object.entries(LAYERS).map(([key, { label, color }]) => (
                <li key={key} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-slate-50">
                  <span className="size-3 rounded-full ring-4 ring-slate-100" style={{ background: color }} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-slate-500">
                      {counts[key]
                        ? `${counts[key]} ${key === "hands" ? (counts[key] > 1 ? "hands" : "hand") : "points"}`
                        : "Not detected"}
                    </p>
                  </div>
                  <Switch
                    checked={layers[key]}
                    onChange={(v) => setLayers((l) => ({ ...l, [key]: v }))}
                    label={`Show ${label}`}
                    disabled={!maskOn}
                  />
                </li>
              ))}
            </ul>
            {nothingDetected && (
              <p className="mt-3 rounded-xl bg-primary/5 px-3 py-2 text-xs text-primary">
                Server is connected but returned no landmarks yet.
              </p>
            )}
          </Card>

          <Card title="Connection">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Inference" value={live ? Math.round(stats.fps) : "—"} unit="fps" />
              <Stat label="Latency" value={live ? Math.round(stats.latency) : "—"} unit="ms" />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
              <span>Endpoint</span>
              <code className="rounded-md bg-slate-100 px-2 py-1 font-mono text-slate-700">
                /api/ws/landmarks
              </code>
            </div>
          </Card>
        </aside>
      </main>
    </div>
  );
}

function EmptyState({ starting, error, onStart }) {
  return (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(ellipse_at_center,#132f6b_0%,#020617_75%)] px-6">
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="grid size-16 place-items-center rounded-2xl bg-primary/15 text-[#8fb4ff] ring-1 ring-primary/40">
          <CameraIcon />
        </div>
        <div>
          <p className="text-lg font-semibold text-white">
            {starting ? "Starting camera…" : "Ready when you are"}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            Turn on your camera to see live pose and face tracking.
          </p>
        </div>
        {error && (
          <p className="max-w-sm rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300 ring-1 ring-rose-500/30">
            {error}
          </p>
        )}
        <button
          onClick={onStart}
          disabled={starting}
          className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/40 transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          {error ? "Try again" : "Start camera"}
        </button>
      </div>
    </div>
  );
}

function StatusPill({ label, text, tone }) {
  return (
    <span className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs ring-1 ring-slate-200">
      <span className={`size-2 rounded-full ${TONE_DOT[tone]}`} />
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{text}</span>
    </span>
  );
}

function Card({ title, action, children }) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div className="rounded-xl bg-[#f4f7ff] px-3 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
        {value}
        <span className="ml-1 text-xs font-medium text-slate-400">{unit}</span>
      </p>
    </div>
  );
}

function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed ${
        checked ? "bg-primary" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-4" : ""
        }`}
      />
    </button>
  );
}

const iconProps = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function ArrowLeftIcon() {
  return (
    <svg {...iconProps}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg {...iconProps} width={28} height={28}>
      <path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 14" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg {...iconProps} width={16} height={16}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}
