
import { coachingStorage } from "@/lib/session";
const files = new Map();
const urls = new Map();

export function stashVideoFile(analysisId, file) {
  files.set(analysisId, file);
  const existing = urls.get(analysisId);
  if (existing) URL.revokeObjectURL(existing);
  urls.set(analysisId, URL.createObjectURL(file));
}

export function getVideoFile(analysisId) {
  return files.get(analysisId);
}

export function getVideoObjectUrl(analysisId) {
  const local = urls.get(analysisId);
  if (local) return local;
  if (typeof window !== "undefined") {
    const run = coachingStorage().getItem(`mellonaires.coaching.${analysisId}`);
    if (run && /^[a-f0-9]{32}$/.test(run)) return `/api/runs/${run}/original`;
  }
  return undefined;
}
