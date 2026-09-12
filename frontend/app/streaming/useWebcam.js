"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useWebcam() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const mounted = useRef(true);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    if (mounted.current) setStatus("idle");
  }, []);
  const start = useCallback(async () => {
    setStatus("starting");setError(null);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera recording requires localhost or HTTPS. You can upload a recording instead.");
      const media = await navigator.mediaDevices.getUserMedia({video:{width:{ideal:1280},height:{ideal:720},facingMode:"user"},audio:true});
      if (!mounted.current) {media.getTracks().forEach(track=>track.stop());return null;}
      streamRef.current=media;
      if (!media.getAudioTracks().length) throw new Error("A microphone is required for script analysis and reference speech.");
      if (videoRef.current) {videoRef.current.srcObject=media;await videoRef.current.play();}
      setStatus("live");return media;
    } catch(e) {
      stop();
      if(mounted.current){setError(e.name==="NotAllowedError"?"Camera or microphone access was denied. Allow both in browser settings, or upload a recording.":e.message);setStatus("error");}
      return null;
    }
  },[stop]);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;stop();};},[stop]);
  return {videoRef,streamRef,status,error,start,stop};
}
