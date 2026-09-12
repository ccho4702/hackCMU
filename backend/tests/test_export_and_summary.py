from app.analyzers.mock_analyzer import synthetic_frame
from app.export.csv import result_to_json_bytes, windows_to_csv
from app.schemas.analysis import AnalysisConfig, AnalysisResult, VideoMetadata
from app.scoring.summary import build_summary, quality_summary
from app.scoring.thresholds import detect_segments
from app.scoring.windows import build_windows, prepare_frames
from app.scoring.heuristic_v1 import HeuristicV1Strategy
from app.scoring.smoothing import smooth_window_metrics
from app.core.defaults import SCHEMA_VERSION, SCORING_VERSION
from app.schemas.analysis import ResultConfig


def _result() -> AnalysisResult:
    frames = [synthetic_frame(i * 80, 8000, gap_start=4000, gap_end=5200) for i in range(100)]
    config = AnalysisConfig()
    windows = build_windows(
        frames,
        prepare_frames(frames),
        window_size_ms=config.window_size_ms,
        stride_ms=config.stride_ms,
        minimum_valid_coverage=config.minimum_valid_coverage,
        strategy=HeuristicV1Strategy(),
        config=config,
    )
    windows = smooth_window_metrics(windows, config.smoothing_alpha)
    segments = detect_segments(
        windows,
        config.thresholds,
        min_duration_ms=config.min_segment_duration_ms,
        merge_gap_ms=config.merge_gap_ms,
        strong_score=config.strong_score,
        min_strong_duration_ms=config.min_strong_duration_ms,
    )
    quality = quality_summary(frames)
    summary = build_summary(windows, segments, frames, config.thresholds)
    return AnalysisResult(
        schema_version=SCHEMA_VERSION,
        analysis_id="anl_test",
        video=VideoMetadata(
            video_id="vid_test",
            file_name="demo.mp4",
            duration_ms=8000,
            width=640,
            height=360,
            file_size_bytes=1234,
        ),
        provenance={
            "createdAt": "2026-01-01T00:00:00Z",
            "mediapipeVersion": "0",
            "modelVersion": "test",
            "modelAssetId": "test",
            "scoringVersion": SCORING_VERSION,
            "analyzer": "mock",
            "mock": True,
        },
        config=ResultConfig.model_validate(config.model_dump()),
        quality=quality,
        summary=summary,
        segments=segments,
        windows=windows,
        frames=frames,
    )


def test_quality_and_summary_cover_missing_region():
    result = _result()
    assert 0 < result.quality.valid_face_coverage < 1
    assert result.summary.gaze is None or 0 <= result.summary.gaze <= 100
    dumped = result.model_dump(by_alias=True)
    assert dumped["schemaVersion"] == SCHEMA_VERSION
    assert "windows" in dumped


def test_csv_has_numeric_fields_not_formatted_strings():
    csv_text = windows_to_csv(_result())
    header, *rows = [line for line in csv_text.strip().splitlines() if line]
    assert header.startswith("startMs,endMs,gaze")
    sample = rows[0].split(",")
    int(sample[0])
    float(sample[6])


def test_json_can_exclude_frames():
    result = _result()
    full = result_to_json_bytes(result, include_frames=True)
    lite = result_to_json_bytes(result, include_frames=False)
    assert len(lite) < len(full)
    assert b'"frames":[]' in lite or b'"frames": []' in lite
