from __future__ import annotations

import logging
import threading
from pathlib import Path

import numpy as np

from app.analyzers.base import ProgressFn
from app.api.errors import AppError
from app.core.config import Settings, get_settings
from app.core.defaults import SCHEMA_VERSION, SCORING_VERSION
from app.features.gaze_estimator import estimate_gaze
from app.features.head_pose import head_pose_from_matrix
from app.features.landmark_normalizer import landmarks_to_array
from app.features.quality import frame_quality
from app.mediapipe.face_landmarker import FaceLandmarkerSession
from app.mediapipe.model_loader import ensure_model, sha256_file
from app.schemas.analysis import (
    AnalysisConfig,
    AnalysisResult,
    FrameAnalysis,
    ResultConfig,
    VideoMetadata,
)
from app.schemas.errors import ErrorCode
from app.schemas.jobs import AnalysisStatus
from app.scoring.alerts import alerts_from_windows
from app.scoring.heuristic_v1 import HeuristicV1Strategy
from app.scoring.smoothing import smooth_window_metrics
from app.scoring.summary import build_summary, quality_summary
from app.scoring.thresholds import detect_segments
from app.scoring.windows import build_windows, prepare_frames
from app.services.video_service import iter_sampled_frames

logger = logging.getLogger(__name__)


class MediaPipeAnalyzer:
    name = "mediapipe"
    mock = False

    def __init__(self, settings: Settings | None = None):
        self.settings = settings or get_settings()

    def analyze(
        self,
        video_path: Path,
        video: VideoMetadata,
        config: AnalysisConfig,
        *,
        analysis_id: str,
        created_at: str,
        cancel_event: threading.Event,
        progress: ProgressFn,
    ) -> AnalysisResult:
        progress(
            {
                "status": AnalysisStatus.preparing,
                "phase": "Loading Face Landmarker",
                "progress": 0.02,
                "duration_ms": video.duration_ms,
                "processed_ms": 0,
            }
        )
        try:
            import mediapipe as mp
        except Exception as exc:
            raise AppError(
                ErrorCode.MODEL_INITIALIZATION_FAILED,
                "MediaPipe could not be imported.",
                status_code=500,
                details={"reason": str(exc)},
            ) from exc
        model_path = ensure_model(self.settings)
        checksum = sha256_file(model_path)
        session = FaceLandmarkerSession(model_path)
        mediapipe_version = getattr(mp, "__version__", "unknown")
        frames: list[FrameAnalysis] = []
        try:
            progress(
                {
                    "status": AnalysisStatus.analyzing,
                    "phase": "Detecting facial landmarks",
                    "progress": 0.05,
                }
            )
            duration = max(1, video.duration_ms)
            for timestamp_ms, rgb in iter_sampled_frames(
                video_path, config.analysis_fps, video.duration_ms
            ):
                if cancel_event.is_set():
                    raise AppError(
                        ErrorCode.CANCELLED,
                        "Analysis was cancelled.",
                        status_code=499,
                    )
                observation = session.detect(rgb, timestamp_ms)
                frame = observation_to_frame(timestamp_ms, observation)
                frames.append(frame)
                ratio = min(1.0, timestamp_ms / duration)
                progress(
                    {
                        "status": AnalysisStatus.analyzing,
                        "phase": "Detecting facial landmarks",
                        "progress": 0.05 + 0.75 * ratio,
                        "processed_ms": timestamp_ms,
                        "duration_ms": video.duration_ms,
                    }
                )
        finally:
            session.close()

        if not frames:
            raise AppError(
                ErrorCode.INVALID_VIDEO,
                "No frames could be sampled from the video.",
            )

        quality = quality_summary(frames)
        if quality.detected_face_frame_count == 0:
            raise AppError(
                ErrorCode.NO_FACE_DETECTED,
                "No face was detected in the sampled frames.",
                details={"sampledFrameCount": quality.sampled_frame_count},
            )
        if quality.valid_face_coverage < 0.05:
            raise AppError(
                ErrorCode.INSUFFICIENT_VALID_DATA,
                "Too few valid face observations to produce delivery metrics.",
                details={"validFaceCoverage": quality.valid_face_coverage},
            )

        progress(
            {
                "status": AnalysisStatus.aggregating,
                "phase": "Aggregating windows and scores",
                "progress": 0.86,
                "processed_ms": video.duration_ms,
            }
        )
        result = finalize_result(
            frames=frames,
            video=video,
            config=config,
            analysis_id=analysis_id,
            created_at=created_at,
            mediapipe_version=mediapipe_version,
            model_version=model_path.name,
            model_asset_id=self.settings.model_asset_id,
            model_checksum=checksum,
            analyzer="mediapipe",
            mock=False,
            backend_version=self.settings.backend_version,
        )
        progress(
            {
                "status": AnalysisStatus.finalizing,
                "phase": "Writing analysis result",
                "progress": 0.96,
            }
        )
        return result


def observation_to_frame(timestamp_ms: int, observation) -> FrameAnalysis:
    landmarks = observation.landmarks
    blendshapes = observation.blendshapes
    matrix = observation.facial_transformation_matrix
    pts = landmarks_to_array(landmarks) if landmarks else None
    pose = head_pose_from_matrix(np.asarray(matrix) if matrix else None)
    gaze = estimate_gaze(pts, pose) if pts is not None else None
    quality = frame_quality(landmarks, blendshapes, pose, gaze)
    if not quality.face_detected:
        return FrameAnalysis(
            timestamp_ms=timestamp_ms,
            landmarks=None,
            blendshapes=None,
            facial_transformation_matrix=None,
            head_pose=None,
            gaze=None,
            quality=quality,
        )
    return FrameAnalysis(
        timestamp_ms=timestamp_ms,
        landmarks=landmarks,
        blendshapes=blendshapes,
        facial_transformation_matrix=matrix,
        head_pose=pose,
        gaze=gaze,
        quality=quality,
    )


def finalize_result(
    *,
    frames: list[FrameAnalysis],
    video: VideoMetadata,
    config: AnalysisConfig,
    analysis_id: str,
    created_at: str,
    mediapipe_version: str,
    model_version: str,
    model_asset_id: str,
    model_checksum: str | None,
    analyzer: str,
    mock: bool,
    backend_version: str,
) -> AnalysisResult:
    strategy = HeuristicV1Strategy()
    prepared = prepare_frames(frames)
    windows = build_windows(
        frames,
        prepared,
        window_size_ms=config.window_size_ms,
        stride_ms=config.stride_ms,
        minimum_valid_coverage=config.minimum_valid_coverage,
        strategy=strategy,
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
    alerts = alerts_from_windows(windows, config)
    return AnalysisResult(
        schema_version=SCHEMA_VERSION,
        analysis_id=analysis_id,
        video=video,
        provenance={
            "createdAt": created_at,
            "mediapipeVersion": mediapipe_version,
            "modelVersion": model_version,
            "modelAssetId": model_asset_id,
            "modelChecksumSha256": model_checksum,
            "scoringVersion": SCORING_VERSION,
            "backendVersion": backend_version,
            "analyzer": analyzer,
            "mock": mock,
        },
        config=ResultConfig.model_validate(config.model_dump()),
        quality=quality,
        summary=summary,
        segments=segments,
        windows=windows,
        frames=frames,
        alerts=alerts,
    )
