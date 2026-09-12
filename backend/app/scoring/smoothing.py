from __future__ import annotations

from app.schemas.analysis import WindowAnalysis, WindowMetrics


def smooth_window_metrics(
    windows: list[WindowAnalysis],
    alpha: float,
) -> list[WindowAnalysis]:
    """Causal EMA on each metric. Nulls do not become zeros; they break the chain."""
    if not windows or alpha <= 0:
        return windows
    alpha = min(1.0, max(0.0, alpha))
    prev: dict[str, float] = {}
    out: list[WindowAnalysis] = []
    fields = ("gaze", "expression_activity", "stability", "expressiveness")
    for window in windows:
        data = window.metrics.model_dump()
        smoothed = dict(data)
        for field in fields:
            value = data.get(field)
            if value is None:
                prev.pop(field, None)
                continue
            if field in prev:
                value = alpha * value + (1.0 - alpha) * prev[field]
            prev[field] = value
            smoothed[field] = int(round(value))
        out.append(
            window.model_copy(update={"metrics": WindowMetrics.model_validate(smoothed)})
        )
    return out
