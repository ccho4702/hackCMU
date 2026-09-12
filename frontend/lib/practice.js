export const SCORE_AXES = [
  ["pronunciation_score", "Pronunciation", "Word clarity"],
  ["rate_ratio", "Pace", "Your duration ÷ reference"],
  ["rhythm_score", "Rhythm", "Word-by-word timing"],
  ["intonation_score", "Intonation", "Pitch contour"],
  ["stress_match", "Emphasis", "Stressed words"],
];

export function activeWordAt(words, seconds) {
  return words.findIndex(word => Number.isFinite(word.t0) && Number.isFinite(word.t1) && word.t0 <= seconds && seconds < word.t1);
}

export function audioRecordingOptions(recorder) {
  const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find(type => recorder.isTypeSupported(type));
  return { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 };
}

export function scoreLabel(key, value) {
  if (!Number.isFinite(value)) return "—";
  return key === "rate_ratio" ? `${value.toFixed(2)}×` : `${Math.round(value * 100)}`;
}
