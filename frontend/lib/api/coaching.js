import { startPipeline } from "@/lib/coaching-api";

export async function beginCoaching(file, analysisId, language) {
  const key = `mellonaires.coaching.${analysisId}`;
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  try {
    const selectedLanguage = language ?? localStorage.getItem(`${key}.language`) ?? "en";
    localStorage.setItem(`${key}.language`, selectedLanguage);
    let userId = localStorage.getItem("rehearse.userId");
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem("rehearse.userId", userId);
    }
    const job = await startPipeline(file, userId, selectedLanguage);
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
