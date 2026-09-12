from __future__ import annotations

import math

import numpy as np

from backend.app.features.landmark_normalizer import (
    LEFT_EYE_BOTTOM,
    LEFT_EYE_INNER,
    LEFT_EYE_OUTER,
    LEFT_EYE_TOP,
    LEFT_IRIS_CENTER,
    RIGHT_EYE_BOTTOM,
    RIGHT_EYE_INNER,
    RIGHT_EYE_OUTER,
    RIGHT_EYE_TOP,
    RIGHT_IRIS_CENTER,
    distance,
)
from backend.app.schemas.analysis import GazeEstimate, HeadPose

EAR_CLOSED = 0.15
IRIS_REQUIRED = 478


def estimate_gaze(
    pts: np.ndarray | None,
    head_pose: HeadPose | None,
    *,
    ear_closed: float = EAR_CLOSED,
) -> GazeEstimate:
    """Approximate presentation-oriented gaze (not calibrated eye tracking).

    Combines iris position relative to eyelid/corner geometry with head yaw
    and pitch. Blink frames are marked invalid rather than scored as looking
    away.
    """
    if pts is None or pts.shape[0] < IRIS_REQUIRED:
        return GazeEstimate(horizontal=0.0, vertical=0.0, confidence=0.0, valid=False)

    left_ear = _ear(pts[LEFT_EYE_TOP], pts[LEFT_EYE_BOTTOM], pts[LEFT_EYE_INNER], pts[LEFT_EYE_OUTER])
    right_ear = _ear(
        pts[RIGHT_EYE_TOP], pts[RIGHT_EYE_BOTTOM], pts[RIGHT_EYE_INNER], pts[RIGHT_EYE_OUTER]
    )
    if left_ear < ear_closed and right_ear < ear_closed:
        return GazeEstimate(horizontal=0.0, vertical=0.0, confidence=0.0, valid=False)

    left = _iris_offset(
        pts[LEFT_IRIS_CENTER],
        pts[LEFT_EYE_INNER],
        pts[LEFT_EYE_OUTER],
        pts[LEFT_EYE_TOP],
        pts[LEFT_EYE_BOTTOM],
    )
    right = _iris_offset(
        pts[RIGHT_IRIS_CENTER],
        pts[RIGHT_EYE_INNER],
        pts[RIGHT_EYE_OUTER],
        pts[RIGHT_EYE_TOP],
        pts[RIGHT_EYE_BOTTOM],
    )
    if left is None and right is None:
        return GazeEstimate(horizontal=0.0, vertical=0.0, confidence=0.0, valid=False)

    samples = [s for s in (left, right) if s is not None]
    iris_h = float(np.mean([s[0] for s in samples]))
    iris_v = float(np.mean([s[1] for s in samples]))

    yaw = head_pose.yaw_deg if head_pose else 0.0
    pitch = head_pose.pitch_deg if head_pose else 0.0
    # Map degrees into the same [-1, 1] iris units. 35° yaw ≈ full offset.
    horizontal = _clamp(iris_h + yaw / 35.0, -1.5, 1.5)
    vertical = _clamp(iris_v + pitch / 35.0, -1.5, 1.5)

    openness = max(left_ear, right_ear)
    eye_conf = min(1.0, max(0.0, (openness - ear_closed) / 0.12))
    iris_conf = 1.0 if left and right else 0.65
    pose_conf = 1.0 if head_pose is not None else 0.7
    confidence = float(_clamp(0.45 * eye_conf + 0.35 * iris_conf + 0.20 * pose_conf, 0.0, 1.0))
    valid = confidence >= 0.35
    return GazeEstimate(
        horizontal=float(horizontal),
        vertical=float(vertical),
        confidence=confidence,
        valid=valid,
    )


def _ear(top: np.ndarray, bottom: np.ndarray, inner: np.ndarray, outer: np.ndarray) -> float:
    vertical = distance(top, bottom)
    horizontal = distance(inner, outer)
    if horizontal < 1e-6:
        return 0.0
    return vertical / horizontal


def _iris_offset(
    iris: np.ndarray,
    inner: np.ndarray,
    outer: np.ndarray,
    top: np.ndarray,
    bottom: np.ndarray,
) -> tuple[float, float] | None:
    min_x, max_x = (float(min(inner[0], outer[0])), float(max(inner[0], outer[0])))
    min_y, max_y = (float(min(top[1], bottom[1])), float(max(top[1], bottom[1])))
    if max_x - min_x < 1e-5 or max_y - min_y < 1e-5:
        return None
    h = ((float(iris[0]) - min_x) / (max_x - min_x) - 0.5) * 2.0
    v = ((float(iris[1]) - min_y) / (max_y - min_y) - 0.5) * 2.0
    if abs(h) > 3.0 or abs(v) > 3.0:
        return None
    return h, v


def _clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def gaze_deviation(horizontal: float, vertical: float) -> float:
    return math.hypot(horizontal, vertical)
