"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Sparkles, Square } from "lucide-react";
import { MomentInspector } from "@/components/analytics/MomentInspector";
import { Timeline } from "@/components/analytics/Timeline";
import { AlertNoticeStack } from "@/components/player/AlertNotice";
import { MeshOverlay } from "@/components/player/MeshOverlay";
import { OverlayCard } from "@/components/player/OverlayCard";
import {
  Card,
  ControlBar,
  ControlButton,
  ErrorNote,
  GlassPill,
  PageShell,
  Segmented,
  Stage,
  StageMessage,
  StatusPill,
} from "@/components/ui/studio";
import { useAlertToasts } from "@/hooks/useAlertToasts";
import { useDisplayRect } from "@/hooks/useDisplayRect";
import { ApiError, createLiveSession, sendLiveFrame, stopLiveSession } from "@/lib/api/client";
import { LanguageSelect } from "@/components/LanguageSelect";
import { beginCoaching } from "@/lib/api/coaching";
import { stashVideoFile } from "@/lib/media/videoStore";

import { formatClock } from "@/lib/analysis/format";

const ANALYSIS_INTERVAL_MS = 1000 / 12;

const HORIZONS = [
  { value: 30_000, label: "30s" },
  { value: 60_000, label: "60s" },
];

export function LiveWorkspace() {
  const router = useRouter();
  const videoRef = useRef(null);
  const [videoEl, setVideoEl] = useState(null);
  const [container, setContainer] = useState(null);
  const meshRef = useRef(null);
  const timelineRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const sessionRef = useRef(null);
  const inFlight = useRef(false);
  const startedAt = useRef(0);
  const running = useRef(false);
  const unmounted = useRef(false);

  const [language, setLanguage] = useState("en");
  const [accent, setAccent] = useState("original");
  const [session, setSession] = useState(null);
  const [meshEnabled, setMeshEnabled] = useState(true);
  const [meshMode, setMeshMode] = useState("full");
  const [horizon, setHorizon] = useState(30_000);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState(null);
  const [ui, setUi] = useState({
    timeMs: 0,
    frame: null,
    window: null,
    windows: [],
    alerts: [],
    alertHistory: [],
  });

  const rect = useDisplayRect(container, videoEl);
  const notices = useAlertToasts(ui.alerts, ui.timeMs);
  const viewStartMs = Math.max(0, ui.timeMs - horizon);

  const bindVideo = useCallback((node) => {
    videoRef.current = node;
    setVideoEl(node);
  }, []);

  // Release the camera and recorder when leaving the page.
  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      running.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, []);

  const loop = useCallback(function loop() {
    if (!running.current) return;
    const video = videoRef.current;
    const sessionId = sessionRef.current?.sessionId;
    if (!video || !sessionId || video.readyState < 2) {
      window.setTimeout(loop, ANALYSIS_INTERVAL_MS);
      return;
    }
    if (inFlight.current) {
      window.setTimeout(loop, ANALYSIS_INTERVAL_MS);
      return;
    }
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    const targetW = 480;
    const scale = targetW / width;
    canvas.width = targetW;
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      window.setTimeout(loop, ANALYSIS_INTERVAL_MS);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    inFlight.current = true;
    const timestampMs = Math.round(performance.now() - startedAt.current);
    canvas.toBlob(
      (blob) => {
        if (!blob || !running.current || !sessionRef.current) {
          inFlight.current = false;
          if (running.current) window.setTimeout(loop, ANALYSIS_INTERVAL_MS);
          return;
        }
        void sendLiveFrame(sessionRef.current.sessionId, blob, timestampMs)
          .then((tick) => {
            if (!running.current) return;
            meshRef.current?.draw(tick.frame, tick.alerts);
            timelineRef.current?.draw(tick.timestampMs);
            setUi({
              timeMs: tick.timestampMs,
              frame: tick.frame,
              window: tick.window,
              windows: tick.windows,
              alerts: tick.alerts,
              alertHistory: tick.alertHistory ?? [],
            });
          })
          .catch((err) => {
            if (!running.current) return;
            if (err instanceof ApiError) setError(`${err.code}: ${err.message}`);
          })
          .finally(() => {
            inFlight.current = false;
            if (running.current) window.setTimeout(loop, ANALYSIS_INTERVAL_MS);
          });
      },
      "image/jpeg",
      0.62,
    );
  }, []);

  // Runs when the user presses Start: camera + mic, live session, recorder, analysis loop.
  const start = useCallback(async () => {
    if (starting || sessionRef.current) return;
    setStarting(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: true,
      });
      if (unmounted.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const accepted = await createLiveSession();
      if (unmounted.current) {
        void stopLiveSession(accepted.sessionId);
        return;
      }
      sessionRef.current = accepted;
      setSession(accepted);
      startedAt.current = performance.now();
      running.current = true;
      chunksRef.current = [];
      const mime = pickMime();
      try {
        const recorder = new MediaRecorder(stream, {
          ...(mime ? { mimeType: mime } : {}),
          videoBitsPerSecond: 2_000_000,
          audioBitsPerSecond: 96_000,
        });
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunksRef.current.push(event.data);
        };
        recorder.start(1000);
        recorderRef.current = recorder;
      } catch {
        recorderRef.current = null;
        setError(
          "Camera analysis is running, but this browser could not record audio/video for script and voice generation.",
        );
      }
      loop();
    } catch (err) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (videoRef.current) videoRef.current.srcObject = null;
      if (unmounted.current) return;
      if (err instanceof ApiError) setError(`${err.code}: ${err.message}`);
      else if (err instanceof DOMException && err.name === "NotAllowedError") {
        setError("Camera permission was denied.");
      } else {
        setError(err instanceof Error ? err.message : "Could not start live analysis.");
      }
    } finally {
      if (!unmounted.current) setStarting(false);
    }
  }, [loop, starting]);

  const collectRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    if (recorder.state === "inactive") {
      return chunksRef.current.length
        ? new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" })
        : null;
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        resolve(
          chunksRef.current.length
            ? new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" })
            : null,
        );
      };
      recorder.stop();
    });
  }, []);

  const stop = useCallback(async () => {
    if (stopping || !sessionRef.current || !running.current) return;
    setStopping(true);
    running.current = false;
    const sessionId = sessionRef.current.sessionId;
    const recording = await collectRecording();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    try {
      const stopped = await stopLiveSession(sessionId);
      if (recording && recording.size > 0) {
        const file = new File(
          [recording],
          recording.type.includes("mp4") ? "live-session.mp4" : "live-session.webm",
          {
            type: recording.type || "video/webm",
          },
        );
        stashVideoFile(stopped.analysisId, file);
        await beginCoaching(file, stopped.analysisId, language, accent);
      }
      router.push(`/analysis/${stopped.analysisId}`);
    } catch (err) {
      if (err instanceof ApiError) setError(`${err.code}: ${err.message}`);
      else setError(err instanceof Error ? err.message : "Could not stop the session.");
      setStopping(false);
    }
  }, [router, stopping, collectRecording, language, accent]);

  const failed = !session && !starting && error;
  const cameraStatus = session
    ? { text: stopping ? "Stopping" : "Live", tone: stopping ? "pending" : "ok" }
    : starting
      ? { text: "Starting", tone: "pending" }
      : failed
        ? { text: "Error", tone: "error" }
        : { text: "Off", tone: "off" };
  const serverStatus = session
    ? error
      ? { text: "Error", tone: "error" }
      : { text: "Connected", tone: "ok" }
    : starting
      ? { text: "Connecting", tone: "pending" }
      : { text: "Off", tone: "off" };

  return (
    <PageShell
      title="Live Analysis"
      subtitle="Real-time face tracking & delivery metrics"
      mock={session?.mock}
      right={
        <>
          <StatusPill label="Camera" {...cameraStatus} />
          <StatusPill label="Server" {...serverStatus} />
        </>
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <LanguageSelect value={language} onChange={setLanguage} accent={accent} onAccentChange={setAccent} disabled={starting || Boolean(session) || stopping} />
          <Stage ref={setContainer}>
            {/* Mirrored like a selfie view; video and mesh flip together so they stay aligned */}
            <div className="absolute inset-0 origin-center -scale-x-100">
              <video
                ref={bindVideo}
                className="size-full object-contain"
                playsInline
                muted
                autoPlay
              />
              <MeshOverlay ref={meshRef} rect={rect} enabled={meshEnabled} mode={meshMode} />
            </div>

            {!session ? (
              <StageMessage
                icon={<Camera className="size-7" />}
                title={
                  starting
                    ? "Requesting camera…"
                    : failed
                      ? "Live analysis could not start"
                      : "Ready when you are"
                }
                description="Start to record your camera and microphone with live face tracking. Stop the session to open its review."
              >
                {failed ? <ErrorNote>{error}</ErrorNote> : null}
                <button
                  type="button"
                  onClick={() => void start()}
                  disabled={starting}
                  className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/40 transition-colors hover:bg-primary-hover disabled:opacity-60"
                >
                  {starting ? "Starting…" : failed ? "Try again" : "Start live analysis"}
                </button>
              </StageMessage>
            ) : (
              <>
                <GlassPill className="absolute left-4 top-4 z-10">
                  <span className="size-2 animate-pulse rounded-full bg-rose-500" />
                  LIVE
                  <span className="font-mono font-normal tabular-nums text-white/80">
                    {formatClock(ui.timeMs, false)}
                  </span>
                </GlassPill>
                <AlertNoticeStack notices={notices} />
                {error ? (
                  <ErrorNote className="absolute inset-x-4 bottom-20 z-10 bg-slate-950/80 backdrop-blur">
                    {error}
                  </ErrorNote>
                ) : null}
                <ControlBar>
                  <ControlButton
                    tone={meshEnabled ? "primary" : "ghost"}
                    onClick={() => setMeshEnabled((v) => !v)}
                  >
                    <Sparkles className="size-4" />
                    Mesh {meshEnabled ? "on" : "off"}
                  </ControlButton>
                  <ControlButton tone="danger" onClick={() => void stop()} disabled={stopping}>
                    <Square className="size-3.5 fill-current" />
                    {stopping ? "Stopping…" : "Stop session"}
                  </ControlButton>
                </ControlBar>
              </>
            )}
          </Stage>

          <Card
            title={`Rolling timeline · last ${horizon / 1000}s`}
            action={<Segmented value={horizon} options={HORIZONS} onChange={setHorizon} />}
          >
            <Timeline
              ref={timelineRef}
              durationMs={horizon}
              viewStartMs={viewStartMs}
              windows={ui.windows}
              segments={[]}
              alerts={ui.alertHistory}
              selection={null}
              interactive={false}
              onSeek={() => undefined}
              onSelect={() => undefined}
            />
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <MomentInspector
            timeMs={ui.timeMs}
            window={ui.window}
            frame={ui.frame}
            alerts={ui.alerts}
            live
          />
          <OverlayCard
            enabled={meshEnabled}
            onEnabledChange={setMeshEnabled}
            mode={meshMode}
            onModeChange={setMeshMode}
          />
        </aside>
      </div>
    </PageShell>
  );
}

function pickMime() {
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
    "video/mp4",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}
