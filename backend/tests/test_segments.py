from backend.app.schemas.analysis import (
    ThresholdConfig,
    WindowAnalysis,
    WindowFeatures,
    WindowMetrics,
)
from backend.app.scoring.thresholds import detect_segments


def _window(start: int, gaze: int | None, coverage: float = 1.0) -> WindowAnalysis:
    return WindowAnalysis(
        start_ms=start,
        end_ms=start + 1000,
        sample_count=12,
        valid_coverage=coverage,
        metrics=WindowMetrics(gaze=gaze, expression_activity=80, stability=80, expressiveness=80),
        features=WindowFeatures(head_yaw_mean=-12.0, gaze_horizontal_mean=-0.3),
    )


def test_merges_neighboring_failures():
    windows = [
        _window(0, 80),
        _window(500, 30),
        _window(1000, 28),
        _window(1500, 32),
        _window(2000, 85),
    ]
    segments = detect_segments(
        windows,
        ThresholdConfig(),
        min_duration_ms=1500,
        merge_gap_ms=750,
        strong_score=82,
        min_strong_duration_ms=2000,
    )
    weak = [s for s in segments if s.type == "LOW_GAZE"]
    assert len(weak) == 1
    assert weak[0].start_ms == 500
    assert weak[0].end_ms == 2500
    assert weak[0].severity == "critical"


def test_does_not_merge_across_invalid_gap():
    windows = [
        _window(0, 20),
        _window(500, 22),
        _window(1000, None, coverage=0.1),
        _window(1500, None, coverage=0.0),
        _window(2000, None, coverage=0.0),
        _window(2500, 18),
        _window(3000, 19),
        _window(3500, 21),
    ]
    segments = detect_segments(
        windows,
        ThresholdConfig(),
        min_duration_ms=1000,
        merge_gap_ms=2000,
        strong_score=90,
        min_strong_duration_ms=5000,
    )
    weak = [s for s in segments if s.type == "LOW_GAZE"]
    assert len(weak) == 2


def test_single_window_is_not_a_strong_segment():
    windows = [_window(0, 95), _window(500, 50)]
    segments = detect_segments(
        windows,
        ThresholdConfig(),
        min_duration_ms=1500,
        merge_gap_ms=750,
        strong_score=82,
        min_strong_duration_ms=2000,
    )
    strong = [s for s in segments if s.kind == "strong"]
    assert strong == []
