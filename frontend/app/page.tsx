"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppHeader } from "@/components/layout/AppHeader";
import { UploadPanel } from "@/components/upload/UploadPanel";

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const run = new URLSearchParams(window.location.search).get("run");
    if (run && /^[a-f0-9]{32}$/.test(run)) router.replace(`/evaluation?run=${run}`);
  }, [router]);
  const [mode, setMode] = useState<"choose" | "upload">("choose");

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-16">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted">Instrumentation</p>
        <h1 className="mt-2 max-w-xl text-3xl font-medium tracking-tight">
          Quantitative analysis of observable facial delivery.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Measure landmarks, head geometry, camera-oriented gaze, and blendshape activity.
          Then review a revised script and practice with your own reference voice. Facial metrics describe observable movement, not emotions or personality.
        </p>
        {mode === "choose" ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className="rounded-lg border border-border bg-card px-5 py-6 text-left transition-colors hover:bg-track"
            >
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Recorded</div>
              <div className="mt-2 text-base font-medium">Analyze Recorded Video</div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Upload a presentation file for post-session metrics, segments, and export.
              </p>
            </button>
            <Link
              href="/live"
              className="rounded-lg border border-border bg-card px-5 py-6 text-left transition-colors hover:bg-track"
            >
              <div className="text-[11px] uppercase tracking-[0.12em] text-muted">Camera</div>
              <div className="mt-2 text-base font-medium">Start Live Analysis</div>
              <p className="mt-2 text-[13px] leading-relaxed text-muted">
                Monitor delivery on the webcam with the same scoring pipeline, then review.
              </p>
            </Link>
          </div>
        ) : (
          <div className="mt-10">
            <button
              type="button"
              onClick={() => setMode("choose")}
              className="mb-4 text-xs text-muted hover:text-foreground"
            >
              All modes
            </button>
            <UploadPanel />
          </div>
        )}
      </main>
    </div>
  );
}
