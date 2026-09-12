"use client";

import { useLayoutEffect, useRef } from "react";

// Preserve the duration-based box width; shrink only text that cannot fit it.
export default function AutoFitWord({ children }) {
  const container = useRef(null);
  const text = useRef(null);

  useLayoutEffect(() => {
    const box = container.current;
    const label = text.current;
    let disposed = false;
    function fit() {
      if (disposed || !box || !label || !box.clientWidth) return;
      label.style.fontSize = "13px";
      const width = label.getBoundingClientRect().width;
      const available = Math.max(1, box.clientWidth - 0.5);
      if (width > available) label.style.fontSize = `${Math.floor(13 * available / width * 100) / 100}px`;
    }
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    document.fonts.ready.then(fit);
    return () => { disposed = true; observer.disconnect(); };
  }, [children]);

  return <span ref={container} className="word-box-text"><span ref={text} className="word-fit-text">{children}</span></span>;
}
