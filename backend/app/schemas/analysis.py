from __future__ import annotations

from typing import Any, Literal

from pydantic import Field, field_validator

from backend.app.core.defaults import (
    DEFAULT_ALERT_ENTER_MS,
    DEFAULT_ALERT_EXIT_MS,
    DEFAULT_ALERT_HYSTERESIS,
    DEFAULT_ANALYSIS_FPS,
    DEFAULT_MERGE_GAP_MS,
    DEFAULT_MIN_SEGMENT_DURATION_MS,
    DEFAULT_MIN_STRONG_DURATION_MS,
    DEFAULT_MINIMUM_VALID_COVERAGE,
    DEFAULT_SMOOTHING_ALPHA,
    DEFAULT_STRIDE_MS,
    DEFAULT_STRONG_SCORE,
    DEFAULT_THRESHOLDS,
    DEFAULT_WINDOW_SIZE_MS,
)
from backend.app.schemas.common import APIModel


class Landmark3D(APIModel):
    x: float
    y: float
    z: float


class HeadPose(APIModel):
    yaw_deg: float
    pitch_deg: float
    roll_deg: float


class GazeEstimate(APIModel):
    horizontal: float
    vertical: float
    confidence: float
    valid: bool


class FrameQuality(APIModel):
    face_detected: bool
    gaze_valid: bool
    pose_valid: bool
    blendshapes_valid: bool


class FrameAnalysis(APIModel):
    timestamp_ms: int
    landmarks: list[Landmark3D] | None = None
    blendshapes: dict[str, float] | None = None
    facial_transformation_matrix: list[float] | None = None
    head_pose: HeadPose | None = None
    gaze: GazeEstimate | None = None
    quality: FrameQuality


class MetricThreshold(APIModel):
    warning: int = 60
    critical: int = 40


class ThresholdConfig(APIModel):
    gaze: MetricThreshold = Field(default_factory=lambda: MetricThreshold(warning=64, critical=42))
    expression_activity: MetricThreshold = Field(
        default_factory=lambda: MetricThreshold(warning=55, critical=35)
    )
    stability: MetricThreshold = Field(
        default_factory=lambda: MetricThreshold(warning=65, critical=45)
    )
    expressiveness: MetricThreshold = Field(
        default_factory=lambda: MetricThreshold(warning=55, critical=35)
    )


class AnalysisConfig(APIModel):
    analysis_fps: float = DEFAULT_ANALYSIS_FPS
    window_size_ms: int = DEFAULT_WINDOW_SIZE_MS
    stride_ms: int = DEFAULT_STRIDE_MS
    minimum_valid_coverage: float = DEFAULT_MINIMUM_VALID_COVERAGE
    smoothing_alpha: float = DEFAULT_SMOOTHING_ALPHA
    min_segment_duration_ms: int = DEFAULT_MIN_SEGMENT_DURATION_MS
    merge_gap_ms: int = DEFAULT_MERGE_GAP_MS
    strong_score: int = DEFAULT_STRONG_SCORE
    min_strong_duration_ms: int = DEFAULT_MIN_STRONG_DURATION_MS
    alert_enter_ms: int = DEFAULT_ALERT_ENTER_MS
    alert_exit_ms: int = DEFAULT_ALERT_EXIT_MS
    alert_hysteresis: int = DEFAULT_ALERT_HYSTERESIS
    thresholds: ThresholdConfig = Field(default_factory=ThresholdConfig)

    @field_validator("analysis_fps")
    @classmethod
    def fps_range(cls, value: float) -> float:
        if not 8.0 <= value <= 24.0:
            raise ValueError("analysisFps must be between 8 and 24")
        return value

    @field_validator("window_size_ms", "stride_ms")
    @classmethod
    def positive_window(cls, value: int) -> int:
        if value < 100:
            raise ValueError("window/stride must be at least 100 ms")
        return value

    @field_validator("minimum_valid_coverage")
    @classmethod
    def coverage_range(cls, value: float) -> float:
        if not 0.0 <= value <= 1.0:
            raise ValueError("minimumValidCoverage must be in [0, 1]")
        return value

    @field_validator("alert_enter_ms", "alert_exit_ms")
    @classmethod
    def alert_persist(cls, value: int) -> int:
        if value < 200:
            raise ValueError("alert persistence must be at least 200 ms")
        return value

    @field_validator("alert_hysteresis")
    @classmethod
    def hysteresis_range(cls, value: int) -> int:
        if not 0 <= value <= 20:
            raise ValueError("alertHysteresis must be in [0, 20]")
        return value


class WindowMetrics(APIModel):
    gaze: int | None = None
    expression_activity: int | None = None
    stability: int | None = None
    expressiveness: int | None = None


class WindowFeatures(APIModel):
    head_yaw_mean: float | None = None
    head_pitch_mean: float | None = None
    head_roll_mean: float | None = None
    gaze_horizontal_mean: float | None = None
    gaze_vertical_mean: float | None = None
    blendshape_variance: float | None = None
    expression_velocity: float | None = None
    head_angular_speed: float | None = None
    jitter: float | None = None
    expressiveness_range: float | None = None
    activation_diversity: float | None = None


class WindowAnalysis(APIModel):
    start_ms: int
    end_ms: int
    sample_count: int
    valid_coverage: float
    metrics: WindowMetrics
    features: WindowFeatures


class SegmentMetrics(APIModel):
    average_score: float | None = None
    minimum_score: float | None = None
    maximum_score: float | None = None


class SegmentContext(APIModel):
    head_yaw_mean: float | None = None
    head_pitch_mean: float | None = None
    gaze_horizontal_mean: float | None = None
    valid_coverage: float | None = None


class AnalysisSegment(APIModel):
    id: str
    type: str
    kind: Literal["weak", "strong"]
    start_ms: int
    end_ms: int
    duration_ms: int
    severity: Literal["warning", "critical", "strong"]
    metrics: SegmentMetrics
    context: SegmentContext


class DeliveryAlert(APIModel):
    id: str
    metric: Literal["gaze", "expression_activity", "stability", "expressiveness"]
    severity: Literal["warning", "critical"]
    region: Literal["eyes", "contour", "mouth_brows"]
    message: str
    start_ms: int
    end_ms: int | None = None
    duration_ms: int | None = None


class VideoMetadata(APIModel):
    video_id: str
    file_name: str
    duration_ms: int
    width: int
    height: int
    file_size_bytes: int
    source_fps: float | None = None
    source: Literal["upload", "live"] = "upload"


class AnalysisProvenance(APIModel):
    created_at: str
    mediapipe_version: str
    model_version: str
    model_asset_id: str
    model_checksum_sha256: str | None = None
    scoring_version: str
    backend_version: str | None = None
    analyzer: str
    mock: bool = False


class AnalysisQualitySummary(APIModel):
    valid_face_coverage: float
    valid_gaze_coverage: float
    valid_pose_coverage: float
    valid_blendshape_coverage: float
    sampled_frame_count: int
    detected_face_frame_count: int
    no_face_frame_count: int


class TimeInterval(APIModel):
    start_ms: int
    end_ms: int
    label: str | None = None


class BlendshapeStat(APIModel):
    name: str
    mean: float
    range: float


class AnalysisSummary(APIModel):
    overall: int | None = None
    gaze: int | None = None
    expression_activity: int | None = None
    stability: int | None = None
    expressiveness: int | None = None
    strongest_interval: TimeInterval | None = None
    weakest_interval: TimeInterval | None = None
    time_below_gaze_threshold_ratio: float | None = None
    longest_low_expression_interval_ms: int | None = None
    dominant_blendshapes: list[BlendshapeStat] = Field(default_factory=list)


class ResultConfig(APIModel):
    analysis_fps: float
    window_size_ms: int
    stride_ms: int
    minimum_valid_coverage: float
    smoothing_alpha: float
    min_segment_duration_ms: int
    merge_gap_ms: int
    strong_score: int
    min_strong_duration_ms: int
    alert_enter_ms: int = DEFAULT_ALERT_ENTER_MS
    alert_exit_ms: int = DEFAULT_ALERT_EXIT_MS
    alert_hysteresis: int = DEFAULT_ALERT_HYSTERESIS
    thresholds: ThresholdConfig


class AnalysisResult(APIModel):
    schema_version: str
    analysis_id: str
    video: VideoMetadata
    provenance: AnalysisProvenance
    config: ResultConfig
    quality: AnalysisQualitySummary
    summary: AnalysisSummary
    segments: list[AnalysisSegment]
    windows: list[WindowAnalysis]
    frames: list[FrameAnalysis]
    alerts: list[DeliveryAlert] = Field(default_factory=list)


class AnalysisResultLite(APIModel):
    """Summary payload without raw frames, for future split loading."""

    schema_version: str
    analysis_id: str
    video: VideoMetadata
    provenance: AnalysisProvenance
    config: ResultConfig
    quality: AnalysisQualitySummary
    summary: AnalysisSummary
    segments: list[AnalysisSegment]
    windows: list[WindowAnalysis]
    alerts: list[DeliveryAlert] = Field(default_factory=list)
    frame_count: int


class LiveSessionAccepted(APIModel):
    session_id: str
    analysis_id: str
    status: Literal["live"] = "live"
    analysis_fps: float
    window_size_ms: int
    stride_ms: int
    mock: bool = False


class LiveTick(APIModel):
    session_id: str
    timestamp_ms: int
    duration_ms: int
    frame: FrameAnalysis
    window: WindowAnalysis | None = None
    windows: list[WindowAnalysis] = Field(default_factory=list)
    alerts: list[DeliveryAlert] = Field(default_factory=list)
    alert_history: list[DeliveryAlert] = Field(default_factory=list)


class LiveSessionStopResult(APIModel):
    analysis_id: str
    status: Literal["completed"] = "completed"


def thresholds_from_mapping(raw: dict[str, Any] | None) -> ThresholdConfig:
    if not raw:
        return ThresholdConfig.model_validate(DEFAULT_THRESHOLDS)
    return ThresholdConfig.model_validate({**DEFAULT_THRESHOLDS, **raw})
