"use client";

import { useEffect, useState } from "react";
import { computeVideoDisplayRect } from "@/lib/media/displayRect";

export function useDisplayRect(container, video) {
  const [rect, setRect] = useState({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    elementWidth: 0,
    elementHeight: 0,
  });

  useEffect(() => {
    if (!container) return;

    const update = () => {
      const cr = container.getBoundingClientRect();
      const vw = video?.videoWidth ?? 0;
      const vh = video?.videoHeight ?? 0;
      setRect(computeVideoDisplayRect(cr.width, cr.height, vw, vh));
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    video?.addEventListener("loadedmetadata", update);
    return () => {
      observer.disconnect();
      video?.removeEventListener("loadedmetadata", update);
    };
  }, [container, video]);

  return rect;
}
