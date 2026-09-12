const files = new Map<string, File>();
const urls = new Map<string, string>();

export function stashVideoFile(analysisId: string, file: File) {
  files.set(analysisId, file);
  const existing = urls.get(analysisId);
  if (existing) URL.revokeObjectURL(existing);
  urls.set(analysisId, URL.createObjectURL(file));
}

export function getVideoFile(analysisId: string): File | undefined {
  return files.get(analysisId);
}

export function getVideoObjectUrl(analysisId: string): string | undefined {
  const local = urls.get(analysisId);
  if (local) return local;
  if (typeof window !== "undefined") {
    const run = localStorage.getItem(`mellonaires.coaching.${analysisId}`);
    if (run && /^[a-f0-9]{32}$/.test(run)) return `/api/runs/${run}/original`;
  }
  return undefined;
}
