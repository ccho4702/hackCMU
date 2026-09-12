from __future__ import annotations

from collections import defaultdict

from backend.app.schemas.analysis import (
    AnalysisQualitySummary,
    AnalysisSegment,
    AnalysisSummary,
    BlendshapeStat,
    FrameAnalysis,
    ThresholdConfig,
    TimeInterval,
    WindowAnalysis,
)
from backend.app.utils.piecewise import round_score


def quality_summary(frames: list[FrameAnalysis]) -> AnalysisQualitySummary:
    n = len(frames)
    if n == 0:
        return AnalysisQualitySummary(
            valid_face_coverage=0.0,
            valid_gaze_coverage=0.0,
            valid_pose_coverage=0.0,
            valid_blendshape_coverage=0.0,
            sampled_frame_count=0,
            detected_face_frame_count=0,
            no_face_frame_count=0,
        )
    face = sum(1 for f in frames if f.quality.face_detected)
    gaze = sum(1 for f in frames if f.quality.gaze_valid)
    pose = sum(1 for f in frames if f.quality.pose_valid)
    blend = sum(1 for f in frames if f.quality.blendshapes_valid)
    return AnalysisQualitySummary(
        valid_face_coverage=face / n,
        valid_gaze_coverage=gaze / n,
        valid_pose_coverage=pose / n,
        valid_blendshape_coverage=blend / n,
        sampled_frame_count=n,
        detected_face_frame_count=face,
        no_face_frame_count=n - face,
    )


def build_summary(
    windows: list[WindowAnalysis],
    segments: list[AnalysisSegment],
    frames: list[FrameAnalysis],
    thresholds: ThresholdConfig,
) -> AnalysisSummary:
    gaze = _mean_metric(windows, "gaze")
    activity = _mean_metric(windows, "expression_activity")
    stability = _mean_metric(windows, "stability")
    expressiveness = _mean_metric(windows, "expressiveness")
    available = [v for v in (gaze, activity, stability, expressiveness) if v is not None]
    overall = round_score(sum(available) / len(available)) if available else None

    weak = [s for s in segments if s.kind == "weak"]
    strong = [s for s in segments if s.kind == "strong"]
    weakest = min(weak, key=lambda s: (s.metrics.average_score is None, s.metrics.average_score or 0)) if weak else None
    strongest = max(
        strong,
        key=lambda s: (s.metrics.average_score or 0, s.duration_ms),
    ) if strong else None

    warning = thresholds.gaze.warning
    gaze_windows = [w for w in windows if w.metrics.gaze is not None]
    below = (
        sum(1 for w in gaze_windows if w.metrics.gaze is not None and w.metrics.gaze < warning)
        / len(gaze_windows)
        if gaze_windows
        else None
    )

    low_expr = [s for s in weak if s.type == "LOW_EXPRESSION_ACTIVITY"]
    longest_low_expr = max((s.duration_ms for s in low_expr), default=None)

    return AnalysisSummary(
        overall=overall,
        gaze=round_score(gaze),
        expression_activity=round_score(activity),
        stability=round_score(stability),
        expressiveness=round_score(expressiveness),
        strongest_interval=_interval(strongest, "Strongest interval"),
        weakest_interval=_interval(weakest, "Weakest interval"),
        time_below_gaze_threshold_ratio=below,
        longest_low_expression_interval_ms=longest_low_expr,
        dominant_blendshapes=_dominant_blendshapes(frames),
    )


def _mean_metric(windows: list[WindowAnalysis], field: str) -> float | None:
    values = [getattr(w.metrics, field) for w in windows if getattr(w.metrics, field) is not None]
    if not values:
        return None
    return float(sum(values) / len(values))


def _interval(segment: AnalysisSegment | None, label: str) -> TimeInterval | None:
    if segment is None:
        return None
    return TimeInterval(start_ms=segment.start_ms, end_ms=segment.end_ms, label=label)


def _dominant_blendshapes(frames: list[FrameAnalysis], limit: int = 8) -> list[BlendshapeStat]:
    series: dict[str, list[float]] = defaultdict(list)
    for frame in frames:
        if not frame.blendshapes:
            continue
        for name, value in frame.blendshapes.items():
            series[name].append(float(value))
    stats: list[BlendshapeStat] = []
    for name, values in series.items():
        if len(values) < 2:
            continue
        mean = sum(values) / len(values)
        rng = max(values) - min(values)
        stats.append(BlendshapeStat(name=name, mean=mean, range=rng))
    stats.sort(key=lambda s: s.range, reverse=True)
    return stats[:limit]
