"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// status: "idle" | "starting" | "live" | "error"
export function useWebcam() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const start = useCallback(async () => {
    setStatus("starting");
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setStatus("live");
    } catch (e) {
      setError(
        e.name === "NotAllowedError"
          ? "Camera permission was denied. Allow it in your browser's address bar."
          : e.message,
      );
      setStatus("error");
    }
  }, []);

  useEffect(() => stop, [stop]); // release the camera when leaving the page

  return { videoRef, status, error, start, stop };
}
