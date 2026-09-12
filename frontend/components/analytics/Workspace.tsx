"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ExportMenu } from "@/components/analytics/ExportMenu";
import { FacialSignals } from "@/components/analytics/FacialSignals";
import { MomentInspector } from "@/components/analytics/MomentInspector";
import { RangeStatsPanel } from "@/components/analytics/RangeStats";
import { SegmentList } from "@/components/analytics/SegmentList";
import { SummaryPanel } from "@/components/analytics/SummaryPanel";
import { Timeline, type TimelineHandle, type TimelineSelection } from "@/components/analytics/Timeline";
import { AppHeader } from "@/components/layout/AppHeader";
import { MeshOverlay, type MeshOverlayHandle } from "@/components/player/MeshOverlay";
import { PlaybackControls } from "@/components/player/PlaybackControls";
import { Button } from "@/components/ui/button";
import { useDisplayRect } from "@/hooks/useDisplayRect";
import { useMediaClock } from "@/hooks/useMediaClock";
import { frameAt, windowAt, alertsAt } from "@/lib/analysis/lookup";
import { stashVideoFile } from "@/lib/media/videoStore";
import { MESH_MODES, type MeshMode } from "@/lib/mesh/connections";
import type { AnalysisResult, FrameAnalysis, WindowAnalysis } from "@/lib/types/analysis";
import { AlertNoticeStack } from "@/components/player/AlertNotice";
import { useAlertToasts } from "@/hooks/useAlertToasts";

export function Workspace({
  result,
  videoUrl,
}: {
  result: AnalysisResult;
  videoUrl?: string;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const meshRef = useRef<MeshOverlayHandle>(null);
  const timelineRef = useRef<TimelineHandle>(null);
  const lastUi = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [meshEnabled, setMeshEnabled] = useState(true);
  const [meshMode, setMeshMode] = useState<MeshMode>("contour");
  const [selection, setSelection] = useState<TimelineSelection>(null);
  const [ui, setUi] = useState<{ timeMs: number; frame: FrameAnalysis | null; window: WindowAnalysis | null }>(
    {
      timeMs: 0,
      frame: result.frames[0] ?? null,
      window: result.windows[0] ?? null,
    },
  );
  const [localUrl, setLocalUrl] = useState(videoUrl);

  const timestamps = useMemo(() => result.frames.map((f) => f.timestampMs), [result.frames]);
  const alerts = result.alerts ?? [];
  const rect = useDisplayRect(container, videoEl);
  const durationMs = result.video.durationMs;
  const activeAlerts = useMemo(
    () => alertsAt(alerts, ui.timeMs),
    [alerts, ui.timeMs],
  );
  const notices = useAlertToasts(activeAlerts, ui.timeMs);

  const bindVideo = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoEl(node);
  }, []);

  const seek = useCallback((ms: number) => {
    const video = videoRef.current;
    if (video) video.currentTime = ms / 1000;
    const frame = frameAt(result.frames, timestamps, ms);
    const win = windowAt(result.windows, ms);
    const currentAlerts = alertsAt(alerts, ms);
    meshRef.current?.draw(frame, currentAlerts);
    timelineRef.current?.draw(ms);
    setUi({ timeMs: ms, frame, window: win });
  }, [alerts, result.frames, result.windows, timestamps]);

  useMediaClock(videoEl, (timeMs) => {
    const frame = frameAt(result.frames, timestamps, timeMs);
    const win = windowAt(result.windows, timeMs);
    meshRef.current?.draw(frame, alertsAt(alerts, timeMs));
    timelineRef.current?.draw(timeMs);
    if (timeMs - lastUi.current > 80 || lastUi.current - timeMs > 80) {
      lastUi.current = timeMs;
      setUi({ timeMs, frame, window: win });
    }
  });

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader
        mock={result.provenance.mock}
        right={
          <span className="hidden font-mono text-[11px] sm:inline">
            {result.video.source === "live" ? "Live session" : result.video.fileName} · {result.config.analysisFps} fps analysis
          </span>
        }
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-0 flex-col border-b border-border lg:border-b-0 lg:border-r">
          <div ref={setContainer} className="relative min-h-[280px] flex-1 bg-[#111]">
            {localUrl ? (
              <video
                ref={bindVideo}
                src={localUrl}
                className="h-full w-full object-contain"
                playsInline
                onLoadedMetadata={() => seek(0)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            ) : (
              <label className="flex h-full cursor-pointer items-center justify-center text-sm text-neutral-400">
                Re-select the original video to enable playback
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    stashVideoFile(result.analysisId, file);
                    setLocalUrl(URL.createObjectURL(file));
                  }}
                />
              </label>
            )}
            <MeshOverlay ref={meshRef} rect={rect} enabled={meshEnabled} mode={meshMode} />
            <AlertNoticeStack notices={notices} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-3 py-2">
            <PlaybackControls
              playing={playing}
              currentMs={ui.timeMs}
              durationMs={durationMs}
              onToggle={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void video.play();
                else video.pause();
              }}
            />
            <div className="flex items-center gap-2">
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
        <MomentInspector timeMs={ui.timeMs} window={ui.window} frame={ui.frame} alerts={activeAlerts} />
      </div>

      <section className="border-t border-border bg-card px-3 py-2">
        <Timeline
          ref={timelineRef}
          durationMs={durationMs}
          windows={result.windows}
          segments={result.segments}
          selection={selection}
          onSeek={seek}
          onSelect={setSelection}
        />
      </section>

      <section className="grid gap-6 border-t border-border bg-card px-4 py-4 lg:grid-cols-3">
        <SegmentList
          title="Weak segments"
          segments={result.segments.filter((s) => s.kind === "weak")}
          onSeek={seek}
        />
        <SegmentList
          title="Strong segments"
          segments={result.segments.filter((s) => s.kind === "strong")}
          onSeek={seek}
        />
        <div>
          <div className="mb-2 text-[11px] uppercase tracking-[0.12em] text-muted">Export analysis</div>
          <ExportMenu analysisId={result.analysisId} />
          <p className="mt-2 text-[11px] text-muted">
            Canonical JSON/CSV from the API. Numeric fields are unformatted.
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-card px-4 py-4">
        <RangeStatsPanel
          selection={selection}
          windows={result.windows}
          summary={result.summary}
          onClear={() => setSelection(null)}
        />
      </section>

      <section className="border-t border-border bg-card px-4 py-4">
        <SummaryPanel result={result} />
      </section>

      <FacialSignals frames={result.frames} timeMs={ui.timeMs} durationMs={durationMs} />
    </div>
  );
}
