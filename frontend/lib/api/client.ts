import type {
  AnalysisAccepted,
  AnalysisProgress,
  AnalysisResult,
  ApiErrorBody,
  FrameAnalysis,
  LiveSessionAccepted,
  LiveSessionStopResult,
  LiveTick,
  WindowAnalysis,
} from "@/lib/types/analysis";

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
  code: string;
  details: Record<string, unknown>;
  status: number;

  constructor(code: string, message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function parse(res: Response) {
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      err?.code ?? "ANALYSIS_FAILED",
      err?.message ?? res.statusText,
      res.status,
      (err?.details as Record<string, unknown>) ?? {},
    );
  }
  return body;
}

export async function getHealth() {
  const res = await fetch(`${API_BASE}/api/v1/health`);
  return parse(res);
}

export async function createAnalysis(
  file: File,
  analysisConfig?: Record<string, unknown>,
  thresholdConfig?: Record<string, unknown>,
): Promise<AnalysisAccepted> {
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

export async function getStatus(analysisId: string): Promise<AnalysisProgress> {
  const res = await fetch(`${API_BASE}/api/v1/analyses/${analysisId}/status`, {
    cache: "no-store",
  });
  return parse(res);
}

export async function getResult(
  analysisId: string,
  includeFrames = true,
): Promise<AnalysisResult> {
  const params = new URLSearchParams({ includeFrames: includeFrames ? "true" : "false" });
  const res = await fetch(
    `${API_BASE}/api/v1/analyses/${analysisId}/result?${params.toString()}`,
    { cache: "no-store" },
  );
  return parse(res);
}

export async function getWindows(analysisId: string): Promise<WindowAnalysis[]> {
  const res = await fetch(`${API_BASE}/api/v1/analyses/${analysisId}/windows`, {
    cache: "no-store",
  });
  return parse(res);
}

export async function getFrames(
  analysisId: string,
  startMs?: number,
  endMs?: number,
): Promise<FrameAnalysis[]> {
  const params = new URLSearchParams();
  if (startMs != null) params.set("startMs", String(startMs));
  if (endMs != null) params.set("endMs", String(endMs));
  const res = await fetch(
    `${API_BASE}/api/v1/analyses/${analysisId}/frames?${params.toString()}`,
    { cache: "no-store" },
  );
  return parse(res);
}

export function exportJsonUrl(analysisId: string, includeFrames: boolean) {
  const params = new URLSearchParams({ includeFrames: includeFrames ? "true" : "false" });
  return `${API_BASE}/api/v1/analyses/${analysisId}/export/json?${params.toString()}`;
}

export function exportCsvUrl(analysisId: string) {
  return `${API_BASE}/api/v1/analyses/${analysisId}/export/csv`;
}

export async function deleteAnalysis(analysisId: string) {
  const res = await fetch(`${API_BASE}/api/v1/analyses/${analysisId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) {
    await parse(res);
  }
}

export async function createLiveSession(): Promise<LiveSessionAccepted> {
  const res = await fetch(`${API_BASE}/api/v1/live/sessions`, { method: "POST" });
  return parse(res);
}

export async function sendLiveFrame(
  sessionId: string,
  blob: Blob,
  timestampMs: number,
): Promise<LiveTick> {
  const form = new FormData();
  form.append("frame", blob, "frame.jpg");
  form.append("timestampMs", String(Math.round(timestampMs)));
  const res = await fetch(`${API_BASE}/api/v1/live/sessions/${sessionId}/frames`, {
    method: "POST",
    body: form,
  });
  return parse(res);
}

export async function stopLiveSession(sessionId: string): Promise<LiveSessionStopResult> {
  const res = await fetch(`${API_BASE}/api/v1/live/sessions/${sessionId}/stop`, {
    method: "POST",
  });
  return parse(res);
}
