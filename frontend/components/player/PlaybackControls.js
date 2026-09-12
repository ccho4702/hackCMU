"use client";

import { Pause, Play } from "lucide-react";
import { formatClock } from "@/lib/analysis/format";

// Lives inside a Stage's ControlBar.
export function PlaybackControls({ playing, currentMs, durationMs, onToggle }) {
  return (
    <div className="flex items-center gap-2 pr-2 sm:gap-3">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Pause" : "Play"}
        className="grid size-8 place-items-center rounded-full bg-white text-slate-900 transition-colors hover:bg-slate-100 sm:size-9"
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
      </button>
      <span className="font-mono text-xs tabular-nums text-white/90">
        {formatClock(currentMs)}
        <span className="mx-1.5 text-white/40">/</span>
        {formatClock(durationMs)}
      </span>
    </div>
  );
}
