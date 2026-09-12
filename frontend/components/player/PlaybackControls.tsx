"use client";

import { Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatClock } from "@/lib/analysis/format";

export function PlaybackControls({
  playing,
  currentMs,
  durationMs,
  onToggle,
}: {
  playing: boolean;
  currentMs: number;
  durationMs: number;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button variant="outline" size="icon" onClick={onToggle} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
      <span className="font-mono text-xs tabular text-muted">
        {formatClock(currentMs)}
        <span className="mx-1.5 text-border">/</span>
        {formatClock(durationMs)}
      </span>
    </div>
  );
}
