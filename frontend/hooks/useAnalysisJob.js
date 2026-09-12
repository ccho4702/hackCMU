"use client";

import { useEffect, useState } from "react";
import { API_BASE, ApiError, getResult, getStatus } from "@/lib/api/client";

const TERMINAL = ["completed", "failed", "cancelled"];

export function useAnalysisJob(analysisId) {
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let source = null;
    let poll;

    async function loadResult() {
      try {
        const data = await getResult(analysisId, true);
        if (!cancelled) setResult(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load result");
      }
    }

    function apply(next) {
      if (cancelled) return;
      setProgress(next);
      if (next.status === "completed") void loadResult();
      if (next.status === "failed") {
        setError(
          [next.errorCode, next.errorMessage].filter(Boolean).join(": ") || "Analysis failed.",
        );
      }
      if (next.status === "cancelled") setError("Analysis was cancelled.");
    }

    async function pollOnce() {
      try {
        const next = await getStatus(analysisId);
        apply(next);
        if (TERMINAL.includes(next.status) && poll) {
          window.clearInterval(poll);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("ANALYSIS_NOT_FOUND: This analysis is no longer available.");
          if (poll) window.clearInterval(poll);
          source?.close();
          return;
        }
        setError(err instanceof Error ? err.message : "Status request failed");
      }
    }

    try {
      source = new EventSource(`${API_BASE}/api/v1/analyses/${analysisId}/events`);
      source.addEventListener("status", (event) => {
        apply(JSON.parse(event.data));
      });
      source.addEventListener("complete", (event) => {
        apply(JSON.parse(event.data));
        source?.close();
      });
      source.addEventListener("failed", (event) => {
        apply(JSON.parse(event.data));
        source?.close();
      });
      source.onerror = () => {
        if (cancelled) return;
        source?.close();
        source = null;
        void pollOnce();
        poll = window.setInterval(pollOnce, 600);
      };
    } catch {
      void pollOnce();
      poll = window.setInterval(pollOnce, 600);
    }

    void pollOnce();

    return () => {
      cancelled = true;
      source?.close();
      if (poll) window.clearInterval(poll);
    };
  }, [analysisId]);

  return { progress, result, error };
}
