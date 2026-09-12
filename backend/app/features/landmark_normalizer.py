from __future__ import annotations

import math

import numpy as np

from backend.app.schemas.analysis import Landmark3D

# MediaPipe Face Mesh indices used for geometry.
NOSE_TIP = 1
LEFT_EYE_OUTER = 33
LEFT_EYE_INNER = 133
LEFT_EYE_TOP = 159
LEFT_EYE_BOTTOM = 145
RIGHT_EYE_OUTER = 263
RIGHT_EYE_INNER = 362
RIGHT_EYE_TOP = 386
RIGHT_EYE_BOTTOM = 374
LEFT_IRIS_CENTER = 468
RIGHT_IRIS_CENTER = 473

# Sparse stable points for rigid alignment (eyes + nose).
ALIGN_INDICES = (LEFT_EYE_OUTER, LEFT_EYE_INNER, RIGHT_EYE_OUTER, RIGHT_EYE_INNER, NOSE_TIP)


def landmarks_to_array(landmarks: list[Landmark3D] | list[dict]) -> np.ndarray:
    pts = np.empty((len(landmarks), 3), dtype=np.float64)
    for i, lm in enumerate(landmarks):
        if isinstance(lm, Landmark3D):
            pts[i] = (lm.x, lm.y, lm.z)
        else:
            pts[i] = (lm["x"], lm["y"], lm["z"])
    return pts


def inter_ocular_distance(pts: np.ndarray) -> float:
    if pts.shape[0] <= RIGHT_EYE_INNER:
        return 0.0
    left = 0.5 * (pts[LEFT_EYE_OUTER] + pts[LEFT_EYE_INNER])
    right = 0.5 * (pts[RIGHT_EYE_OUTER] + pts[RIGHT_EYE_INNER])
    return float(np.linalg.norm(left[:2] - right[:2]))


def face_scale(pts: np.ndarray) -> float:
    iod = inter_ocular_distance(pts)
    return iod if iod > 1e-6 else 1.0


def aligned_residual(prev: np.ndarray, curr: np.ndarray) -> float | None:
    """RMS residual after a 2D similarity alignment on sparse points.

    Removes global translation/scale/in-plane rotation so the residual
    reflects local facial deformation rather than whole-head motion.
    """
    if prev.shape != curr.shape or prev.shape[0] <= max(ALIGN_INDICES):
        return None
    src = prev[list(ALIGN_INDICES), :2]
    dst = curr[list(ALIGN_INDICES), :2]
    transform = _similarity_2d(src, dst)
    if transform is None:
        return None
    a, b, tx, ty = transform
    xy = prev[:, :2]
    mapped = np.column_stack(
        [
            a * xy[:, 0] - b * xy[:, 1] + tx,
            b * xy[:, 0] + a * xy[:, 1] + ty,
        ]
    )
    delta = mapped - curr[:, :2]
    scale = face_scale(curr)
    return float(np.sqrt(np.mean(np.sum(delta**2, axis=1))) / max(scale, 1e-6))


def _similarity_2d(src: np.ndarray, dst: np.ndarray) -> tuple[float, float, float, float] | None:
    src_mean = src.mean(axis=0)
    dst_mean = dst.mean(axis=0)
    src_c = src - src_mean
    dst_c = dst - dst_mean
    src_norm = float(np.sum(src_c**2))
    if src_norm < 1e-12:
        return None
    a = float(np.sum(src_c * dst_c) / src_norm)
    b = float(np.sum(src_c[:, 0] * dst_c[:, 1] - src_c[:, 1] * dst_c[:, 0]) / src_norm)
    tx = float(dst_mean[0] - a * src_mean[0] + b * src_mean[1])
    ty = float(dst_mean[1] - b * src_mean[0] - a * src_mean[1])
    return a, b, tx, ty


def distance(a: np.ndarray, b: np.ndarray) -> float:
    return float(math.hypot(float(a[0] - b[0]), float(a[1] - b[1])))
