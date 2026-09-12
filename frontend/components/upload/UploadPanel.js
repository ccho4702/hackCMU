"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { ApiError, createAnalysis } from "@/lib/api/client";
import { beginCoaching } from "@/lib/api/coaching";
import { stashVideoFile } from "@/lib/media/videoStore";
import { LanguageSelect } from "@/components/LanguageSelect";
import { Button } from "@/components/ui/button";

export function UploadPanel() {
  const router = useRouter();
  const [language, setLanguage] = useState("en");
  const [scriptStyle, setScriptStyle] = useState("presentation");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const accepted = await createAnalysis(file);
      stashVideoFile(accepted.analysisId, file);
      await beginCoaching(file, accepted.analysisId, language, scriptStyle);
      router.push(`/analysis/${accepted.analysisId}`);
    } catch (err) {
      if (err instanceof ApiError) setError(`${err.code}: ${err.message}`);
      else setError(err instanceof Error ? err.message : "Upload failed");
      setBusy(false);
    }
  }

  return (
    <div className="w-full">
      <div className="mb-4"><LanguageSelect value={language} onChange={setLanguage} scriptStyle={scriptStyle} onScriptStyleChange={setScriptStyle} disabled={busy} /></div>
      <label className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/25 bg-white px-6 py-14 text-center transition-colors hover:border-primary/50 hover:bg-primary/5">
        <span className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/30">
          <UploadCloud className="size-6" />
        </span>
        <span className="mt-4 text-sm font-semibold text-slate-900">Select a presentation video</span>
        <span className="mt-1 text-xs text-slate-500">
          MP4, MOV, or WebM. Analysis runs on the server at ~12 fps.
        </span>
        <input
          type="file"
          accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <span className="mt-4 rounded-full bg-white px-3 py-1 font-mono text-xs text-slate-600 ring-1 ring-slate-200">
            {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
          </span>
        ) : null}
      </label>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-sm text-xs leading-relaxed text-slate-500">
          Facial geometry analysis plus a separate script and reference-voice evaluation.
        </p>
        <Button onClick={submit} disabled={!file || busy}>
          {busy ? "Uploading…" : "Analyze"}
        </Button>
      </div>
      {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
    </div>
  );
}
