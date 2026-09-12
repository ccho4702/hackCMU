from __future__ import annotations

from typing import Sequence


def piecewise_linear(x: float, points: Sequence[tuple[float, float]]) -> float:
    """Evaluate a piecewise-linear map defined by sorted (x, y) control points."""
    if not points:
        raise ValueError("piecewise map requires at least one point")
    if x <= points[0][0]:
        return float(points[0][1])
    if x >= points[-1][0]:
        return float(points[-1][1])
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        if x <= x1:
            if x1 == x0:
                return float(y1)
            t = (x - x0) / (x1 - x0)
            return float(y0 + t * (y1 - y0))
    return float(points[-1][1])


def clamp_score(value: float) -> float:
    return max(0.0, min(100.0, value))


def round_score(value: float | None) -> int | None:
    if value is None:
        return None
    return int(round(clamp_score(value)))
