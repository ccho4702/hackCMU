import type { DeliveryAlert, FrameAnalysis, WindowAnalysis } from "@/lib/types/analysis";

export function findNearestIndex(timestamps: number[], targetMs: number): number {
  if (timestamps.length === 0) return -1;
  let lo = 0;
  let hi = timestamps.length - 1;
  if (targetMs <= timestamps[0]) return 0;
  if (targetMs >= timestamps[hi]) return hi;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = timestamps[mid];
    if (value === targetMs) return mid;
    if (value < targetMs) lo = mid + 1;
    else hi = mid - 1;
  }
  const after = lo;
  const before = lo - 1;
  if (before < 0) return after;
  if (after >= timestamps.length) return before;
  return Math.abs(timestamps[after] - targetMs) < Math.abs(timestamps[before] - targetMs)
    ? after
    : before;
}

export function frameAt(frames: FrameAnalysis[], timestamps: number[], timeMs: number): FrameAnalysis | null {
  const index = findNearestIndex(timestamps, timeMs);
  return index >= 0 ? frames[index] : null;
}

export function windowAt(windows: WindowAnalysis[], timeMs: number): WindowAnalysis | null {
  if (windows.length === 0) return null;
  let lo = 0;
  let hi = windows.length - 1;
  let found: WindowAnalysis | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const window = windows[mid];
    if (timeMs < window.startMs) {
      hi = mid - 1;
    } else if (timeMs >= window.endMs) {
      lo = mid + 1;
    } else {
      found = window;
      break;
    }
  }
  return found ?? windows[Math.max(0, Math.min(windows.length - 1, lo - 1))] ?? null;
}

export function alertsAt(alerts: DeliveryAlert[], timeMs: number): DeliveryAlert[] {
  return alerts.filter((alert) => {
    if (timeMs < alert.startMs) return false;
    if (alert.endMs == null) return true;
    return timeMs < alert.endMs;
  });
}
