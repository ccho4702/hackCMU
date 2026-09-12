from __future__ import annotations

import math

import numpy as np

from backend.app.schemas.analysis import HeadPose


def angular_speed_deg_s(
    prev: HeadPose | None,
    curr: HeadPose | None,
    dt_s: float,
) -> float | None:
    if prev is None or curr is None or dt_s <= 1e-6:
        return None
    dyaw = _shortest_deg(curr.yaw_deg - prev.yaw_deg)
    dpitch = curr.pitch_deg - prev.pitch_deg
    droll = _shortest_deg(curr.roll_deg - prev.roll_deg)
    return math.sqrt(dyaw * dyaw + dpitch * dpitch + droll * droll) / dt_s


def _shortest_deg(delta: float) -> float:
    while delta > 180:
        delta -= 360
    while delta < -180:
        delta += 360
    return delta


def jitter_from_speeds(speeds: list[float]) -> float | None:
    """High-frequency component: std of first differences of angular speed."""
    if len(speeds) < 3:
        return None
    diffs = np.diff(np.asarray(speeds, dtype=np.float64))
    return float(np.std(diffs))


def mean_or_none(values: list[float]) -> float | None:
    finite = [v for v in values if v is not None and math.isfinite(v)]
    if not finite:
        return None
    return float(np.mean(finite))
