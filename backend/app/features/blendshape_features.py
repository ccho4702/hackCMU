from __future__ import annotations

from typing import Mapping

import numpy as np

BLINK_KEYS = ("eyeBlinkLeft", "eyeBlinkRight")


def ordered_values(
    blendshapes: Mapping[str, float] | None,
    names: list[str] | None = None,
) -> np.ndarray | None:
    if not blendshapes:
        return None
    if names:
        return np.array([float(blendshapes.get(n, 0.0)) for n in names], dtype=np.float64)
    return np.array([float(v) for v in blendshapes.values()], dtype=np.float64)


def expression_velocity(
    previous: Mapping[str, float] | None,
    current: Mapping[str, float] | None,
    dt_s: float,
    names: list[str] | None = None,
) -> float | None:
    if previous is None or current is None or dt_s <= 1e-6:
        return None
    a = ordered_values(previous, names)
    b = ordered_values(current, names)
    if a is None or b is None or a.shape != b.shape:
        return None
    return float(np.linalg.norm(b - a) / dt_s)


def blendshape_variance(window_vectors: list[np.ndarray]) -> float | None:
    if len(window_vectors) < 2:
        return None
    stacked = np.stack(window_vectors, axis=0)
    return float(np.mean(np.var(stacked, axis=0)))


def robust_range(window_vectors: list[np.ndarray]) -> float | None:
    if len(window_vectors) < 2:
        return None
    stacked = np.stack(window_vectors, axis=0)
    p90 = np.percentile(stacked, 90, axis=0)
    p10 = np.percentile(stacked, 10, axis=0)
    return float(np.mean(p90 - p10))


def activation_diversity(window_vectors: list[np.ndarray], threshold: float = 0.08) -> float | None:
    if len(window_vectors) < 2:
        return None
    stacked = np.stack(window_vectors, axis=0)
    ranges = np.max(stacked, axis=0) - np.min(stacked, axis=0)
    active = float(np.mean(ranges >= threshold))
    return active


def mean_blink(blendshapes: Mapping[str, float] | None) -> float | None:
    if not blendshapes:
        return None
    vals = [blendshapes[k] for k in BLINK_KEYS if k in blendshapes]
    if not vals:
        return None
    return float(np.mean(vals))
