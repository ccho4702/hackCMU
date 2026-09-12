"use client";

import { useCallback, useEffect, useRef } from "react";

type FrameCb = (timeMs: number) => void;

export function useMediaClock(video: HTMLVideoElement | null, onFrame: FrameCb) {
  const cbRef = useRef(onFrame);
  useEffect(() => { cbRef.current = onFrame; }, [onFrame]);

  const tick = useCallback(() => {
    if (!video) return;
    cbRef.current(video.currentTime * 1000);
  }, [video]);

  useEffect(() => {
    if (!video) return;
    let stopped = false;
    const rvfc = (
      video as HTMLVideoElement & {
        requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
        cancelVideoFrameCallback?: (id: number) => void;
      }
    ).requestVideoFrameCallback?.bind(video);

    let handle = 0;
    if (rvfc) {
      const loop = (_now: number, meta: { mediaTime: number }) => {
        if (stopped) return;
        cbRef.current(meta.mediaTime * 1000);
        handle = rvfc(loop);
      };
      handle = rvfc(loop);
      return () => {
        stopped = true;
        (
          video as HTMLVideoElement & { cancelVideoFrameCallback?: (id: number) => void }
        ).cancelVideoFrameCallback?.(handle);
      };
    }

    const loop = () => {
      if (stopped) return;
      tick();
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => {
      stopped = true;
      cancelAnimationFrame(handle);
    };
  }, [video, tick]);
}
