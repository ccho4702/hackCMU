"use client";

import Link from "next/link";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import { ErrorNote, PageShell, Stage, StageMessage, StatusPill } from "@/components/ui/studio";
import { formatClock, formatPercent } from "@/lib/analysis/format";

export function ProgressScreen({ progress, error }) {
  const value = progress?.progress ?? 0;
  return (
    <PageShell
      title="Session Review"
      subtitle="Analyzing your session"
      mock={progress?.mock}
      right={
        <StatusPill
          label="Analysis"
          text={error ? "Failed" : (progress?.status ?? "Queued")}
          tone={error ? "error" : "pending"}
        />
      }
    >
      <Stage className="mx-auto w-full max-w-4xl">
        <StageMessage
          icon={
            error ? (
              <TriangleAlert className="size-7" />
            ) : (
              <LoaderCircle className="size-7 animate-spin" />
            )
          }
          title={error ? "Analysis did not complete" : "Processing presentation video"}
          description={error ? null : (progress?.phase ?? "Queued")}
        >
          {error ? (
            <>
              <ErrorNote>{error}</ErrorNote>
              <Link
                href="/"
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary/40 transition-colors hover:bg-primary-hover"
              >
                Back to upload
              </Link>
            </>
          ) : (
            <div className="w-full">
              <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
                  style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between font-mono text-xs tabular-nums text-slate-400">
                <span>{formatPercent(value, 0)}</span>
                <span>
                  {progress?.processedMs != null && progress.durationMs
                    ? `${formatClock(progress.processedMs, false)} / ${formatClock(progress.durationMs, false)}`
                    : "—"}
                </span>
              </div>
            </div>
          )}
        </StageMessage>
      </Stage>
    </PageShell>
  );
}
