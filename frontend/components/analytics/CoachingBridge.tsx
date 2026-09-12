"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { beginCoaching } from "@/lib/api/coaching";
import { getVideoFile, stashVideoFile } from "@/lib/media/videoStore";

export function CoachingBridge({ analysisId }: { analysisId: string }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsFile, setNeedsFile] = useState(false);
  useEffect(() => { Promise.resolve().then(() => {
    setRunId(localStorage.getItem(`mellonaires.coaching.${analysisId}`));
    setError(localStorage.getItem(`mellonaires.coaching.${analysisId}.error`) || "");
  }); }, [analysisId]);
  async function start(file?: File) {
    const source = file || getVideoFile(analysisId);
    if (!source) { setNeedsFile(true); return; }
    setBusy(true); setError("");
    const id = await beginCoaching(source, analysisId);
    setRunId(id || null);
    if (!id) setError(localStorage.getItem(`mellonaires.coaching.${analysisId}.error`) || "Could not start processing.");
    setBusy(false);
  }
  return <section className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-4 py-3"><div><p className="text-xs font-medium">Script &amp; voice practice</p><p className="mt-1 text-[11px] text-muted">{runId ? "Your delivery feedback, revised script, and voice reference can be followed in Evaluation as processing completes." : "Keep this facial analysis and add a revised script, TTS reference, and repeatable voice trials."}</p>{error && <p role="alert" className="mt-1 text-xs text-critical">{error}</p>}{needsFile && <input type="file" accept="video/*,.mov" aria-label="Recording for script and voice" className="mt-2 text-xs" onChange={e => { const file=e.target.files?.[0];if(file){stashVideoFile(analysisId,file);void start(file);} }}/>}</div>{runId ? <Link className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-fg" href={`/evaluation?run=${runId}&analysis=${analysisId}`}>Open evaluation →</Link> : <Button size="sm" disabled={busy} onClick={() => void start()}>{busy ? "Uploading…" : "Generate script & voice"}</Button>}</section>;
}
