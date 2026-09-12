import { startPipeline } from "@/lib/coaching-api";
import { pipelineUserId, coachingStorage } from "@/lib/session";

export async function beginCoaching(file, analysisId, language, scriptStyle) {
  const storage = coachingStorage();
  const key = `mellonaires.coaching.${analysisId}`;
  const existing = storage.getItem(key);
  if (existing) return existing;
  try {
    const selectedLanguage = language ?? storage.getItem(`${key}.language`) ?? "en";
    const selectedStyle = scriptStyle ?? storage.getItem(`${key}.scriptStyle`) ?? "presentation";
    storage.setItem(`${key}.scriptStyle`, selectedStyle);
    storage.setItem(`${key}.language`, selectedLanguage);
    const userId = pipelineUserId();
    const job = await startPipeline(file, userId, selectedLanguage, selectedStyle);
    storage.setItem(key, job.run_id);
    storage.setItem("rehearse.lastRun", job.run_id);
    storage.removeItem(`${key}.error`);
    return job.run_id;
  } catch (error) {
    storage.setItem(
      `${key}.error`,
      error instanceof Error ? error.message : "Script and voice processing could not start.",
    );
    return undefined;
  }
}
