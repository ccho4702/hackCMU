"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { FileVideo, Sparkles } from "lucide-react";
import { CoachingBridge } from "@/components/analytics/CoachingBridge";
import { ExportMenu } from "@/components/analytics/ExportMenu";
import { MomentInspector } from "@/components/analytics/MomentInspector";
import { SegmentList } from "@/components/analytics/SegmentList";
import { SummaryPanel } from "@/components/analytics/SummaryPanel";
import { Timeline } from "@/components/analytics/Timeline";
import { AlertNoticeStack } from "@/components/player/AlertNotice";
import { MeshOverlay } from "@/components/player/MeshOverlay";
import { OverlayCard } from "@/components/player/OverlayCard";
import { PlaybackControls } from "@/components/player/PlaybackControls";
import {
  Card,
  ControlBar,
  ControlButton,
  PageShell,
  Stage,
  StageMessage,
} from "@/components/ui/studio";
import { useAlertToasts } from "@/hooks/useAlertToasts";
import { useDisplayRect } from "@/hooks/useDisplayRect";
import { useMediaClock } from "@/hooks/useMediaClock";
import { alertsAt, frameAt, windowAt } from "@/lib/analysis/lookup";
import { stashVideoFile } from "@/lib/media/videoStore";

export function Workspace({ result, videoUrl }) {
  const videoRef = useRef(null);
  const [videoEl, setVideoEl] = useState(null);
  const [container, setContainer] = useState(null);
  const meshRef = useRef(null);
  const timelineRef = useRef(null);
  const lastUi = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [meshEnabled, setMeshEnabled] = useState(true);
  const [meshMode, setMeshMode] = useState("full");
  const [ui, setUi] = useState({
    timeMs: 0,
    frame: result.frames[0] ?? null,
    window: result.windows[0] ?? null,
  });
  const [localUrl, setLocalUrl] = useState(videoUrl);

  const timestamps = useMemo(() => result.frames.map((f) => f.timestampMs), [result.frames]);
  const alerts = useMemo(() => result.alerts ?? [], [result.alerts]);
  const rect = useDisplayRect(container, videoEl);
  const durationMs = result.video.durationMs;
  const activeAlerts = useMemo(() => alertsAt(alerts, ui.timeMs), [alerts, ui.timeMs]);
  const notices = useAlertToasts(activeAlerts, ui.timeMs, !playing);
  const isLive = result.video.source === "live";

  const bindVideo = useCallback((node) => {
    videoRef.current = node;
    setVideoEl(node);
  }, []);

  const seek = useCallback(
    (ms) => {
      const video = videoRef.current;
      if (video) video.currentTime = ms / 1000;
      const frame = frameAt(result.frames, timestamps, ms);
      const win = windowAt(result.windows, ms);
      const currentAlerts = alertsAt(alerts, ms);
      meshRef.current?.draw(frame, currentAlerts);
      timelineRef.current?.draw(ms);
      setUi({ timeMs: ms, frame, window: win });
    },
    [alerts, result.frames, result.windows, timestamps],
  );

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
    <PageShell
      title="Session Review"
      subtitle={`${isLive ? "Live session" : result.video.fileName} · ${result.config.analysisFps} fps analysis`}
      mock={result.provenance.mock}
    >
      <CoachingBridge analysisId={result.analysisId} />

      <SummaryPanel result={result} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Stage ref={setContainer}>
            {localUrl ? (
              <video
                ref={bindVideo}
                src={localUrl}
                className="size-full object-contain"
                playsInline
                onLoadedMetadata={() => seek(0)}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
              />
            ) : (
              <StageMessage
                icon={<FileVideo className="size-7" />}
                title="Video not loaded"
                description="Re-select the original video to enable playback with the overlay."
              >
                <label className="cursor-pointer rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover">
                  Choose video
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
              </StageMessage>
            )}
            <MeshOverlay ref={meshRef} rect={rect} enabled={meshEnabled} mode={meshMode} />
            <AlertNoticeStack notices={notices} />

            {localUrl ? (
              <ControlBar>
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
                <ControlButton
                  tone={meshEnabled ? "primary" : "ghost"}
                  onClick={() => setMeshEnabled((v) => !v)}
                >
                  <Sparkles className="size-4" />
                  Mesh {meshEnabled ? "on" : "off"}
                </ControlButton>
              </ControlBar>
            ) : null}
          </Stage>

          <Card
            title="Timeline"
            action={<span className="text-xs text-slate-400">Click to seek</span>}
          >
            <Timeline
              ref={timelineRef}
              durationMs={durationMs}
              windows={result.windows}
              segments={result.segments}
              alerts={alerts}
              thresholds={result.config.thresholds}
              selection={null}
              onSeek={seek}
              onSelect={() => undefined}
            />
          </Card>
        </div>

        <aside className="flex flex-col gap-4">
          <MomentInspector
            timeMs={ui.timeMs}
            window={ui.window}
            frame={ui.frame}
            alerts={activeAlerts}
            showSignals={false}
          />
          <OverlayCard
            enabled={meshEnabled}
            onEnabledChange={setMeshEnabled}
            mode={meshMode}
            onModeChange={setMeshMode}
          />
        </aside>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
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
        <ExportMenu analysisId={result.analysisId} />
      </div>
    </PageShell>
  );
}
