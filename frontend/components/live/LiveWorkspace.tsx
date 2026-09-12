"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MomentInspector } from "@/components/analytics/MomentInspector";
import { Timeline, type TimelineHandle } from "@/components/analytics/Timeline";
import { AppHeader } from "@/components/layout/AppHeader";
import { AlertNoticeStack } from "@/components/player/AlertNotice";
import { MeshOverlay, type MeshOverlayHandle } from "@/components/player/MeshOverlay";
import { Button } from "@/components/ui/button";
import { useAlertToasts } from "@/hooks/useAlertToasts";
import { useDisplayRect } from "@/hooks/useDisplayRect";
import { ApiError, createLiveSession, sendLiveFrame, stopLiveSession } from "@/lib/api/client";
import { beginCoaching } from "@/lib/api/coaching";
import { stashVideoFile } from "@/lib/media/videoStore";
import { MESH_MODES, type MeshMode } from "@/lib/mesh/connections";
import type { DeliveryAlert, FrameAnalysis, LiveSessionAccepted, WindowAnalysis } from "@/lib/types/analysis";
import { formatClock } from "@/lib/analysis/format";

const ANALYSIS_INTERVAL_MS = 1000 / 12;

export function LiveWorkspace() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const meshRef = useRef<MeshOverlayHandle>(null);
  const timelineRef = useRef<TimelineHandle>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const sessionRef = useRef<LiveSessionAccepted | null>(null);
  const inFlight = useRef(false);
  const startedAt = useRef(0);
  const running = useRef(false);

  const [session, setSession] = useState<LiveSessionAccepted | null>(null);
  const [meshEnabled, setMeshEnabled] = useState(true);
  const [meshMode, setMeshMode] = useState<MeshMode>("contour");
  const [horizon, setHorizon] = useState(30_000);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ui, setUi] = useState<{
    timeMs: number;
    frame: FrameAnalysis | null;
    window: WindowAnalysis | null;
    windows: WindowAnalysis[];
    alerts: DeliveryAlert[];
  }>({
    timeMs: 0,
    frame: null,
    window: null,
    windows: [],
    alerts: [],
  });

  const rect = useDisplayRect(container, videoEl);
  const notices = useAlertToasts(ui.alerts, ui.timeMs);
  const viewStartMs = Math.max(0, ui.timeMs - horizon);

  const bindVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoEl(node);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
          audio: true,
        });
        if (cancelled) {
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
        if (cancelled) { void stopLiveSession(accepted.sessionId); return; }
        sessionRef.current = accepted;
        setSession(accepted);
        startedAt.current = performance.now();
        running.current = true;
        const mime = pickMime();
        try {
          const recorder = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 96_000 });
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) chunksRef.current.push(event.data);
          };
          recorder.start(1000);
          recorderRef.current = recorder;
        } catch {
          recorderRef.current = null;
          setError("Camera analysis is running, but this browser could not record audio/video for script and voice generation.");
        }
        loop();
      } catch (err) {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        if (cancelled) return;
        if (err instanceof ApiError) setError(`${err.code}: ${err.message}`);
        else if (err instanceof DOMException && err.name === "NotAllowedError") {
          setError("Camera permission was denied.");
        } else {
          setError(err instanceof Error ? err.message : "Could not start live analysis.");
        }
      }
    }
    void start();

    function loop() {
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
    }

    return () => {
      cancelled = true;
      running.current = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    };
  }, []);

  const collectRecording = useCallback(async (): Promise<Blob | null> => {
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
        const file = new File([recording], recording.type.includes("mp4") ? "live-session.mp4" : "live-session.webm", {
          type: recording.type || "video/webm",
        });
        stashVideoFile(stopped.analysisId, file);
        await beginCoaching(file, stopped.analysisId);
      }
      router.push(`/analysis/${stopped.analysisId}`);
    } catch (err) {
      if (err instanceof ApiError) setError(`${err.code}: ${err.message}`);
      else setError(err instanceof Error ? err.message : "Could not stop the session.");
      setStopping(false);
    }
  }, [router, stopping, collectRecording]);


  const durationMs = horizon;

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        mock={session?.mock}
        right={
          <span className="flex items-center gap-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-critical">Live</span>
            <span className="hidden font-mono text-[11px] sm:inline">{formatClock(ui.timeMs)}</span>
          </span>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div ref={setContainer} className="relative min-h-[280px] flex-1 overflow-hidden bg-[#111]">
            <div className="absolute inset-0 origin-center scale-x-[-1]">
              <video
                ref={bindVideo}
                className="h-full w-full object-contain"
                playsInline
                muted
                autoPlay
              />
              <MeshOverlay ref={meshRef} rect={rect} enabled={meshEnabled} mode={meshMode} />
            </div>
            <AlertNoticeStack notices={notices} />
            {!session && !error ? (
              <div className="absolute bottom-3 left-3 rounded-md border border-border bg-card/95 px-3 py-2 text-sm text-muted">
                Requesting camera…
              </div>
            ) : null}
            {error ? (
              <div className="absolute bottom-3 left-3 right-3 rounded-md border border-border bg-card/95 px-3 py-2 text-sm text-critical">
                {error}
              </div>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-3 py-2">
            <div className="flex items-center gap-2">
              <Button onClick={() => void stop()} disabled={stopping || !session}>
                {stopping ? "Stopping…" : "Stop session"}
              </Button>
              <span className="font-mono text-xs text-muted">{formatClock(ui.timeMs, false)}</span>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={horizon}
                onChange={(e) => setHorizon(Number(e.target.value))}
                className="h-8 rounded-md border border-border bg-card px-2 text-xs"
              >
                <option value={30_000}>Last 30 seconds</option>
                <option value={60_000}>Last 60 seconds</option>
              </select>
              <Button
                variant={meshEnabled ? "subtle" : "outline"}
                size="sm"
                onClick={() => setMeshEnabled((v) => !v)}
              >
                Mesh {meshEnabled ? "on" : "off"}
              </Button>
              <select
                value={meshMode}
                onChange={(e) => setMeshMode(e.target.value as MeshMode)}
                className="h-8 rounded-md border border-border bg-card px-2 text-xs"
              >
                {MESH_MODES.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
        <MomentInspector
          timeMs={ui.timeMs}
          window={ui.window}
          frame={ui.frame}
          alerts={ui.alerts}
          live
        />
      </div>
      <section className="border-t border-border bg-card px-3 py-2">
        <div className="mb-1 text-[11px] uppercase tracking-[0.12em] text-muted">
          Rolling timeline · last {horizon / 1000}s
        </div>
        <Timeline
          ref={timelineRef}
          durationMs={durationMs}
          viewStartMs={viewStartMs}
          windows={ui.windows}
          segments={[]}
          selection={null}
          interactive={false}
          onSeek={() => undefined}
          onSelect={() => undefined}
        />
      </section>
    </div>
  );
}

function pickMime() {
  const types = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}
