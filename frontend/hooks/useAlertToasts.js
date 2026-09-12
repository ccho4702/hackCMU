"use client";

import { useEffect, useRef, useState } from "react";

export function useAlertToasts(active, timeMs) {
  const [notices, setNotices] = useState([]);
  const seen = useRef(new Set());
  const lastTime = useRef(timeMs);
  const timers = useRef([]);

  useEffect(() => {
    if (timeMs + 400 < lastTime.current) {
      seen.current.clear();
    }
    lastTime.current = timeMs;
    for (const alert of active) {
      if (seen.current.has(alert.id)) continue;
      seen.current.add(alert.id);
      const notice = {
        id: alert.id,
        message: alert.message,
        severity: alert.severity,
      };
      setNotices((current) => [...current.slice(-2), notice]);
      const leave = window.setTimeout(() => {
        setNotices((current) =>
          current.map((item) => (item.id === alert.id ? { ...item, leaving: true } : item)),
        );
      }, 2800);
      const remove = window.setTimeout(() => {
        setNotices((current) => current.filter((item) => item.id !== alert.id));
      }, 3300);
      timers.current.push(leave, remove);
    }
  }, [active, timeMs]);

  useEffect(() => {
    const ids = timers.current;
    return () => {
      ids.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return notices;
}
