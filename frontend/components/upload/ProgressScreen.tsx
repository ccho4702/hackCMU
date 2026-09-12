"use client";

import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { Progress } from "@/components/ui/progress";
import { formatClock, formatPercent } from "@/lib/analysis/format";
import type { AnalysisProgress } from "@/lib/types/analysis";

export function ProgressScreen({
  progress,
  error,
}: {
  progress: AnalysisProgress | null;
  error: string | null;
}) {
  const value = progress?.progress ?? 0;
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader mock={progress?.mock} />
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6">
        <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Analysis job</div>
        <h1 className="mt-2 text-xl font-medium tracking-tight">
          {error ? "Analysis did not complete" : "Processing presentation video"}
        </h1>
        <p className="mt-2 text-sm text-muted">{progress?.phase ?? "Queued"}</p>
        <Progress value={value} className="mt-6" />
        <div className="mt-2 flex justify-between font-mono text-[11px] tabular text-muted">
          <span>{formatPercent(value, 0)}</span>
          <span>
            {progress?.processedMs != null && progress.durationMs
              ? `${formatClock(progress.processedMs, false)} / ${formatClock(progress.durationMs, false)}`
              : "—"}
          </span>
        </div>
        {error ? <p className="mt-4 text-sm text-critical">{error}</p> : null}
        {error ? (
          <Link href="/" className="mt-6 text-sm text-muted hover:text-foreground">
            Back to upload
          </Link>
        ) : null}
      </div>
    </div>
  );
}
