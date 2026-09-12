export function formatClock(ms, withTenths = true) {
  const clamped = Math.max(0, Math.round(ms));
  const minutes = Math.floor(clamped / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1000);
  const tenths = Math.floor((clamped % 1000) / 100);
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  return withTenths ? `${mm}:${ss}.${tenths}` : `${mm}:${ss}`;
}

export function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)} seconds`;
  return `${seconds.toFixed(1)} seconds`;
}

export function formatPercent(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatScore(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return String(Math.round(value));
}

export function formatDelta(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export function formatDegrees(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}°`;
}

export function unavailableReason(metric, faceDetected, gazeValid) {
  if (!faceDetected) return "No face in this sample";
  if (metric === "gaze" && !gazeValid) return "Insufficient eye visibility";
  return "Measurement unavailable";
}
