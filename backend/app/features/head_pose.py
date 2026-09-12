from __future__ import annotations

import math

import numpy as np

from backend.app.schemas.analysis import HeadPose

"""Head pose from MediaPipe facial transformation matrices.

The 4x4 matrix maps the canonical face into camera space. Translation sits
in the last column; rotation occupies the upper-left 3x3.

Sign convention (stable across exports and scoringVersion heuristic_v1):

Coordinate frame: camera looks toward -Z, X right, Y up, matching MediaPipe's
metric face space.

- yaw_deg:   rotation about Y. Positive = speaker turns left
             (nose moves toward the camera's +X / viewer's right).
- pitch_deg: rotation about X. Positive = speaker looks up.
- roll_deg:  rotation about Z. Positive = speaker tilts toward their
             right shoulder (clockwise from the camera's view).

These values are approximate presentation geometry, not a calibrated
optical-motion-capture measurement.
"""


def head_pose_from_matrix(matrix: np.ndarray | list[float] | None) -> HeadPose | None:
    if matrix is None:
        return None
    R = _rotation(matrix)
    if R is None:
        return None
    yaw, pitch, roll = rotation_to_yaw_pitch_roll(R)
    return HeadPose(yaw_deg=yaw, pitch_deg=pitch, roll_deg=roll)


def rotation_to_yaw_pitch_roll(R: np.ndarray) -> tuple[float, float, float]:
    """YXZ intrinsic Tait-Bryan angles from a rotation matrix."""
    r12 = float(np.clip(R[1, 2], -1.0, 1.0))
    pitch = math.asin(-r12)
    if abs(r12) < 0.999999:
        yaw = math.atan2(float(R[0, 2]), float(R[2, 2]))
        roll = math.atan2(float(R[1, 0]), float(R[1, 1]))
    else:
        yaw = math.atan2(-float(R[0, 1]), float(R[0, 0]))
        roll = 0.0
    return math.degrees(yaw), math.degrees(pitch), math.degrees(roll)


def yaw_pitch_roll_to_rotation(yaw_deg: float, pitch_deg: float, roll_deg: float) -> np.ndarray:
    y = math.radians(yaw_deg)
    p = math.radians(pitch_deg)
    r = math.radians(roll_deg)
    cy, sy = math.cos(y), math.sin(y)
    cp, sp = math.cos(p), math.sin(p)
    cr, sr = math.cos(r), math.sin(r)
    Ry = np.array([[cy, 0.0, sy], [0.0, 1.0, 0.0], [-sy, 0.0, cy]])
    Rx = np.array([[1.0, 0.0, 0.0], [0.0, cp, -sp], [0.0, sp, cp]])
    Rz = np.array([[cr, -sr, 0.0], [sr, cr, 0.0], [0.0, 0.0, 1.0]])
    return Ry @ Rx @ Rz


def _rotation(matrix: np.ndarray | list[float]) -> np.ndarray | None:
    arr = np.asarray(matrix, dtype=np.float64)
    if arr.size == 16:
        arr = arr.reshape(4, 4)
    if arr.shape == (4, 4):
        return arr[:3, :3]
    if arr.shape == (3, 3):
        return arr
    return None
