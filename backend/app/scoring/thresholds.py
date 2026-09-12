from __future__ import annotations

from dataclasses import dataclass

from app.schemas.analysis import (
    AnalysisSegment,
    SegmentContext,
    SegmentMetrics,
    ThresholdConfig,
    WindowAnalysis,
)
from app.utils.ids import segment_id

METRIC_KEYS = (
    ("gaze", "LOW_GAZE", "STRONG_GAZE"),
    ("expression_activity", "LOW_EXPRESSION_ACTIVITY", "STRONG_EXPRESSION_ACTIVITY"),
    ("stability", "LOW_STABILITY", "STRONG_STABILITY"),
    ("expressiveness", "LOW_EXPRESSIVENESS", "STRONG_EXPRESSIVENESS"),
)


@dataclass
class _Run:
    start: int
    end: int
    values: list[int]
    severity: str
    coverages: list[float]
    yaw: list[float]
    pitch: list[float]
    gaze_h: list[float]


def detect_segments(
    windows: list[WindowAnalysis],
    thresholds: ThresholdConfig,
    *,
    min_duration_ms: int,
    merge_gap_ms: int,
    strong_score: int,
    min_strong_duration_ms: int,
) -> list[AnalysisSegment]:
    segments: list[AnalysisSegment] = []
    index = 1
    thresh_map = thresholds.model_dump(by_alias=False)
    for field, low_type, strong_type in METRIC_KEYS:
        warning = thresh_map[field]["warning"]
        critical = thresh_map[field]["critical"]
        weak_runs = _collect_runs(
            windows,
            field,
            lambda v: v < warning,
            severity_of=lambda v: "critical" if v < critical else "warning",
        )
        for run in _merge_runs(weak_runs, merge_gap_ms, windows, field):
            if run.end - run.start < min_duration_ms:
                continue
            segments.append(_to_segment(run, low_type, "weak", index))
            index += 1
        strong_runs = _collect_runs(
            windows,
            field,
            lambda v, s=strong_score: v >= s,
            severity_of=lambda _v: "strong",
        )
        for run in _merge_runs(strong_runs, merge_gap_ms, windows, field):
            if run.end - run.start < min_strong_duration_ms:
                continue
            segments.append(_to_segment(run, strong_type, "strong", index))
            index += 1
    segments.sort(key=lambda s: (s.start_ms, s.end_ms, s.type))
    for i, seg in enumerate(segments, start=1):
        seg.id = segment_id(i)
    return segments


def _collect_runs(windows: list[WindowAnalysis], field: str, pred, severity_of) -> list[_Run]:
    runs: list[_Run] = []
    current: _Run | None = None
    for window in windows:
        value = getattr(window.metrics, field)
        if value is None or not pred(value):
            if current:
                runs.append(current)
                current = None
            continue
        if current is None:
            current = _Run(
                start=window.start_ms,
                end=window.end_ms,
                values=[value],
                severity=severity_of(value),
                coverages=[window.valid_coverage],
                yaw=_feat(window, "head_yaw_mean"),
                pitch=_feat(window, "head_pitch_mean"),
                gaze_h=_feat(window, "gaze_horizontal_mean"),
            )
        else:
            current.end = window.end_ms
            current.values.append(value)
            current.coverages.append(window.valid_coverage)
            current.yaw.extend(_feat(window, "head_yaw_mean"))
            current.pitch.extend(_feat(window, "head_pitch_mean"))
            current.gaze_h.extend(_feat(window, "gaze_horizontal_mean"))
            if severity_of(value) == "critical":
                current.severity = "critical"
    if current:
        runs.append(current)
    return runs


def _merge_runs(
    runs: list[_Run],
    merge_gap_ms: int,
    windows: list[WindowAnalysis],
    field: str,
) -> list[_Run]:
    if not runs:
        return []
    merged = [runs[0]]
    for run in runs[1:]:
        prev = merged[-1]
        gap = run.start - prev.end
        if gap <= merge_gap_ms and not _invalid_gap(windows, prev.end, run.start, field):
            prev.end = run.end
            prev.values.extend(run.values)
            prev.coverages.extend(run.coverages)
            prev.yaw.extend(run.yaw)
            prev.pitch.extend(run.pitch)
            prev.gaze_h.extend(run.gaze_h)
            if run.severity == "critical":
                prev.severity = "critical"
        else:
            merged.append(run)
    return merged


def _invalid_gap(windows: list[WindowAnalysis], start: int, end: int, field: str) -> bool:
    """Do not merge across a substantial region of missing measurements."""
    span = max(1, end - start)
    gap_windows = [w for w in windows if w.start_ms >= start and w.end_ms <= end]
    if not gap_windows:
        return span > 400
    invalid = sum(1 for w in gap_windows if getattr(w.metrics, field) is None)
    return invalid / len(gap_windows) >= 0.5


def _feat(window: WindowAnalysis, name: str) -> list[float]:
    value = getattr(window.features, name)
    return [value] if value is not None else []


def _mean(values: list[float]) -> float | None:
    if not values:
        return None
    return float(sum(values) / len(values))


def _to_segment(run: _Run, type_name: str, kind: str, index: int) -> AnalysisSegment:
    return AnalysisSegment(
        id=segment_id(index),
        type=type_name,
        kind=kind,  # type: ignore[arg-type]
        start_ms=run.start,
        end_ms=run.end,
        duration_ms=run.end - run.start,
        severity=run.severity,  # type: ignore[arg-type]
        metrics=SegmentMetrics(
            average_score=_mean([float(v) for v in run.values]),
            minimum_score=float(min(run.values)) if run.values else None,
            maximum_score=float(max(run.values)) if run.values else None,
        ),
        context=SegmentContext(
            head_yaw_mean=_mean(run.yaw),
            head_pitch_mean=_mean(run.pitch),
            gaze_horizontal_mean=_mean(run.gaze_h),
            valid_coverage=_mean(run.coverages),
        ),
    )
