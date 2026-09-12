import { startPipeline } from "@/lib/coaching-api";
import { pipelineUserId } from "@/lib/session";

export async function beginCoaching(file, analysisId, language, accent, scriptStyle) {
  const key = `mellonaires.coaching.${analysisId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  try {
    const selectedLanguage = language ?? localStorage.getItem(`${key}.language`) ?? "en";
    const selectedAccent = selectedLanguage === "en" ? accent ?? localStorage.getItem(`${key}.accent`) ?? "original" : "original";
    const selectedStyle = scriptStyle ?? localStorage.getItem(`${key}.scriptStyle`) ?? "presentation";
    localStorage.setItem(`${key}.scriptStyle`, selectedStyle);
    localStorage.setItem(`${key}.language`, selectedLanguage);
    localStorage.setItem(`${key}.accent`, selectedAccent);
    const userId = pipelineUserId();
    const job = await startPipeline(file, userId, selectedLanguage, selectedAccent, selectedStyle);
    localStorage.setItem(key, job.run_id);
    localStorage.setItem("rehearse.lastRun", job.run_id);
    localStorage.removeItem(`${key}.error`);
    return job.run_id;
  } catch (error) {
    localStorage.setItem(
      `${key}.error`,
      error instanceof Error ? error.message : "Script and voice processing could not start.",
    );
    return undefined;
  }
}
