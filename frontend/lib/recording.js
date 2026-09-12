export const MAX_RECORDING_SECONDS = 90;
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export function recordingOptions(recorderClass) {
  const mimeType = ["video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
    .find((type) => recorderClass.isTypeSupported(type));
  return { ...(mimeType ? { mimeType } : {}), videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 96_000 };
}

export function recordingFilename(mimeType) {
  return `rehearsal.${mimeType.includes("mp4") ? "mp4" : "webm"}`;
}

export function clockTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}

export function timestampSeconds(value) {
  const [minutes, seconds] = value.split(":").map(Number);
  return minutes * 60 + seconds;
}

export function recordingError(error) {
  if (error.name === "NotAllowedError") return "Camera or microphone access was denied. Allow both in your browser settings, or upload a recording.";
  if (error.name === "NotFoundError") return "No camera or microphone was found. Connect a device or upload a recording.";
  if (error.name === "NotReadableError") return "Your camera or microphone is busy. Close other recording apps and try again.";
  return error.message || "Recording could not start. Try uploading a video instead.";
}
