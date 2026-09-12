from __future__ import annotations

from typing import Sequence


def sample_timestamps_ms(
    duration_ms: int,
    analysis_fps: float,
) -> list[int]:
    """Generate target sample timestamps from duration and analysis FPS.

    Actual stored timestamps still come from the decoder clock.
    """
    if duration_ms <= 0 or analysis_fps <= 0:
        return []
    interval = 1000.0 / analysis_fps
    stamps: list[int] = []
    t = 0.0
    last = max(0, duration_ms - 1)
    while t <= last + 1e-6:
        stamps.append(int(round(t)))
        t += interval
        if stamps[-1] >= last:
            break
    if not stamps or stamps[-1] < last:
        if last - (stamps[-1] if stamps else 0) >= interval * 0.25:
            stamps.append(last)
    return stamps


def ensure_monotonic_ms(previous: int | None, candidate: int) -> int:
    if previous is None:
        return max(0, candidate)
    if candidate <= previous:
        return previous + 1
    return candidate


def binary_search_le(values: Sequence[int], target: int) -> int:
    """Largest index i with values[i] <= target, or 0 if all are greater."""
    if not values:
        return -1
    lo, hi = 0, len(values) - 1
    if target < values[0]:
        return 0
    while lo <= hi:
        mid = (lo + hi) // 2
        if values[mid] <= target:
            lo = mid + 1
        else:
            hi = mid - 1
    return hi


def format_timestamp(ms: int) -> str:
    ms = max(0, int(ms))
    minutes, rem = divmod(ms, 60_000)
    seconds, millis = divmod(rem, 1000)
    return f"{minutes:02d}:{seconds:02d}.{millis // 100}"
