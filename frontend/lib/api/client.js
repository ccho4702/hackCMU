export const API_BASE = resolveApiBase();

function resolveApiBase() {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  if (typeof window === "undefined") return configured;
  try {
    const url = new URL(configured);
    if (
      (url.hostname === "localhost" && window.location.hostname === "127.0.0.1") ||
      (url.hostname === "127.0.0.1" && window.location.hostname === "localhost")
    ) {
      url.hostname = window.location.hostname;
    }
    return url.origin;
  } catch {
    return configured;
  }
}

export class ApiError extends Error {
  code;
  details;
  status;

  constructor(code, message, status, details = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function parse(res) {
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const err = body?.error;
    throw new ApiError(
      err?.code ?? "ANALYSIS_FAILED",
      err?.message ?? res.statusText,
      res.status,
      err?.details ?? {},
    );
  }
  return body;
}

export async function getHealth() {
  const res = await fetch(`${API_BASE}/api/v1/health`);
  return parse(res);
}

export async function createAnalysis(file, analysisConfig, thresholdConfig) {
  const form = new FormData();
  form.append("video", file);
  if (analysisConfig) form.append("analysisConfig", JSON.stringify(analysisConfig));
  if (thresholdConfig) form.append("thresholdConfig", JSON.stringify(thresholdConfig));
  const res = await fetch(`${API_BASE}/api/v1/analyses`, {
    method: "POST",
    body: form,
  });
  return parse(res);
}

export async function getStatus(analysisId) {
  const res = await fetch(`${API_BASE}/api/v1/analyses/${analysisId}/status`, {
    cache: "no-store",
  });
  return parse(res);
}

export async function getResult(analysisId, includeFrames = true) {
  const params = new URLSearchParams({ includeFrames: includeFrames ? "true" : "false" });
  const res = await fetch(`${API_BASE}/api/v1/analyses/${analysisId}/result?${params.toString()}`, {
    cache: "no-store",
  });
  return parse(res);
}

export async function getWindows(analysisId) {
  const res = await fetch(`${API_BASE}/api/v1/analyses/${analysisId}/windows`, {
    cache: "no-store",
  });
  return parse(res);
}

export async function getFrames(analysisId, startMs, endMs) {
  const params = new URLSearchParams();
  if (startMs != null) params.set("startMs", String(startMs));
  if (endMs != null) params.set("endMs", String(endMs));
  const res = await fetch(`${API_BASE}/api/v1/analyses/${analysisId}/frames?${params.toString()}`, {
    cache: "no-store",
  });
  return parse(res);
}

export function exportJsonUrl(analysisId, includeFrames) {
  const params = new URLSearchParams({ includeFrames: includeFrames ? "true" : "false" });
  return `${API_BASE}/api/v1/analyses/${analysisId}/export/json?${params.toString()}`;
}

export function exportCsvUrl(analysisId) {
  return `${API_BASE}/api/v1/analyses/${analysisId}/export/csv`;
}

export async function deleteAnalysis(analysisId) {
  const res = await fetch(`${API_BASE}/api/v1/analyses/${analysisId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    await parse(res);
  }
}

export async function createLiveSession() {
  const res = await fetch(`${API_BASE}/api/v1/live/sessions`, { method: "POST" });
  return parse(res);
}

export async function sendLiveFrame(sessionId, blob, timestampMs) {
  const form = new FormData();
  form.append("frame", blob, "frame.jpg");
  form.append("timestampMs", String(Math.round(timestampMs)));
  const res = await fetch(`${API_BASE}/api/v1/live/sessions/${sessionId}/frames`, {
    method: "POST",
    body: form,
  });
  return parse(res);
}

export async function stopLiveSession(sessionId) {
  const res = await fetch(`${API_BASE}/api/v1/live/sessions/${sessionId}/stop`, {
    method: "POST",
  });
  return parse(res);
}
