"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, createAnalysis } from "@/lib/api/client";
import { beginCoaching } from "@/lib/api/coaching";
import { stashVideoFile } from "@/lib/media/videoStore";
import { Button } from "@/components/ui/button";

export function UploadPanel() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const accepted = await createAnalysis(file);
      stashVideoFile(accepted.analysisId, file);
      await beginCoaching(file, accepted.analysisId);
      router.push(`/analysis/${accepted.analysisId}`);
    } catch (err) {
      if (err instanceof ApiError) setError(`${err.code}: ${err.message}`);
      else setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-xl">
      <label
        className="flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center"
      >
        <span className="text-sm font-medium">Select a presentation video</span>
        <span className="mt-1 text-xs text-muted">MP4, MOV, or WebM. Analysis runs on the server at ~12 fps.</span>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <span className="mt-3 font-mono text-xs text-muted">
            {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
          </span>
        ) : null}
      </label>
      <div className="mt-4 flex items-center justify-between">
        <p className="max-w-sm text-[11px] leading-relaxed text-muted">
          Facial geometry analysis plus a separate script and reference-voice evaluation.
        </p>
        <Button onClick={submit} disabled={!file || busy}>
          {busy ? "Uploading…" : "Analyze"}
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-critical">{error}</p> : null}
    </div>
  );
}
