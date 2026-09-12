"use client";

import { coachingStorage } from "@/lib/session";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { beginCoaching } from "@/lib/api/coaching";
import { getVideoFile, stashVideoFile } from "@/lib/media/videoStore";

export function CoachingBridge({ analysisId }) {
  const [runId, setRunId] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsFile, setNeedsFile] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => {
      setRunId(coachingStorage().getItem(`mellonaires.coaching.${analysisId}`));
      setError(coachingStorage().getItem(`mellonaires.coaching.${analysisId}.error`) || "");
    });
  }, [analysisId]);
  async function start(file) {
    const source = file || getVideoFile(analysisId);
    if (!source) {
      setNeedsFile(true);
      return;
    }
    setBusy(true);
    setError("");
    const id = await beginCoaching(source, analysisId);
    setRunId(id || null);
    if (!id)
      setError(
        coachingStorage().getItem(`mellonaires.coaching.${analysisId}.error`) ||
          "Could not start processing.",
      );
    setBusy(false);
  }
  return (
    <section className="flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-2xl bg-slate-950 bg-[url(/banner_dark.png)] bg-cover bg-center p-5 text-white shadow-xl shadow-primary/10 sm:p-6">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/20 backdrop-blur-md">
          <Image src="/optune-mark-white.png" alt="" width={64} height={64} className="size-6" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-shadow-md">Script &amp; voice practice</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-300 text-shadow-sm">
            {runId
              ? "Your delivery feedback, revised script, and voice reference can be followed in Evaluation as processing completes."
              : "Keep this facial analysis and add a revised script, TTS reference, and repeatable voice trials."}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-xs text-rose-300">
              {error}
            </p>
          )}
          {needsFile && (
            <input
              type="file"
              accept="video/*,.mov"
              aria-label="Recording for script and voice"
              className="mt-2 text-xs text-slate-300 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  stashVideoFile(analysisId, file);
                  void start(file);
                }
              }}
            />
          )}
        </div>
      </div>
      {runId ? (
        <Link
          className="flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          href={`/evaluation?run=${runId}&analysis=${analysisId}`}
        >
          Open evaluation
          <ArrowRight className="size-4" />
        </Link>
      ) : (
        <Button disabled={busy} onClick={() => void start()}>
          {busy ? "Uploading…" : "Generate script & voice"}
        </Button>
      )}
    </section>
  );
}
