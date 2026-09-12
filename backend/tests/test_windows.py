from backend.app.analyzers.mock_analyzer import synthetic_frame
from backend.app.core.defaults import DEFAULT_MINIMUM_VALID_COVERAGE
from backend.app.features.quality import frame_quality
from backend.app.schemas.analysis import AnalysisConfig, FrameAnalysis, FrameQuality
from backend.app.scoring.heuristic_v1 import HeuristicV1Strategy
from backend.app.scoring.windows import build_windows, prepare_frames
from backend.app.utils.piecewise import round_score


def _missing_frame(ts: int) -> FrameAnalysis:
    quality = frame_quality(None, None, None, None)
    return FrameAnalysis(
        timestamp_ms=ts,
        landmarks=None,
        blendshapes=None,
        facial_transformation_matrix=None,
        head_pose=None,
        gaze=None,
        quality=quality,
    )


def test_missing_face_is_not_zero_score():
    frames = [_missing_frame(i * 100) for i in range(12)]
    windows = build_windows(
        frames,
        prepare_frames(frames),
        window_size_ms=1000,
        stride_ms=500,
        minimum_valid_coverage=0.7,
        strategy=HeuristicV1Strategy(),
        config=AnalysisConfig(),
    )
    assert windows
    for window in windows:
        assert window.metrics.gaze is None
        assert window.metrics.expression_activity is None
        assert window.metrics.stability is None
        assert window.metrics.expressiveness is None


def test_low_coverage_nulls_affected_metrics():
    frames = [synthetic_frame(i * 80, 2000, gap_start=0, gap_end=0) for i in range(4)]
    frames.extend(_missing_frame(400 + i * 80) for i in range(10))
    windows = build_windows(
        frames,
        prepare_frames(frames),
        window_size_ms=1000,
        stride_ms=1000,
        minimum_valid_coverage=0.7,
        strategy=HeuristicV1Strategy(),
        config=AnalysisConfig(),
    )
    first = next(w for w in windows if w.start_ms == 0)
    assert first.valid_coverage < DEFAULT_MINIMUM_VALID_COVERAGE
    assert first.metrics.gaze is None


def test_valid_scores_are_bounded():
    frames = [synthetic_frame(i * 80, 4000, gap_start=10_000, gap_end=10_000) for i in range(40)]
    windows = build_windows(
        frames,
        prepare_frames(frames),
        window_size_ms=1000,
        stride_ms=500,
        minimum_valid_coverage=0.7,
        strategy=HeuristicV1Strategy(),
        config=AnalysisConfig(),
    )
    for window in windows:
        for value in (
            window.metrics.gaze,
            window.metrics.expression_activity,
            window.metrics.stability,
            window.metrics.expressiveness,
        ):
            if value is not None:
                assert 0 <= value <= 100


def test_valid_windows_include_au_intensity():
    frames = [synthetic_frame(i * 80, 4000, gap_start=10_000, gap_end=10_000) for i in range(20)]
    windows = build_windows(
        frames,
        prepare_frames(frames),
        window_size_ms=1000,
        stride_ms=500,
        minimum_valid_coverage=0.7,
        strategy=HeuristicV1Strategy(),
        config=AnalysisConfig(),
    )
    scored = [w for w in windows if w.metrics.expression_activity is not None]
    assert scored
    assert scored[0].features.au_intensity_mean is not None
    assert scored[0].features.au_intensity_mean > 0.0
    occupancy = scored[0].features.gaze_camera_occupancy
    assert occupancy is None or 0.0 <= occupancy <= 1.0


def test_quality_flags_do_not_invent_zeros():
    quality = FrameQuality(
        face_detected=False,
        gaze_valid=False,
        pose_valid=False,
        blendshapes_valid=False,
    )
    assert quality.face_detected is False
    assert round_score(None) is None
