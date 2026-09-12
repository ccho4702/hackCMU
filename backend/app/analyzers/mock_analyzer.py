from __future__ import annotations

import math
import threading
from pathlib import Path

import numpy as np

from app.analyzers.base import ProgressFn
from app.analyzers.mediapipe_analyzer import finalize_result
from app.core.config import Settings, get_settings
from app.features.gaze_estimator import estimate_gaze
from app.features.head_pose import head_pose_from_matrix, yaw_pitch_roll_to_rotation
from app.features.landmark_normalizer import landmarks_to_array
from app.features.quality import frame_quality
from app.schemas.analysis import (
    AnalysisConfig,
    AnalysisResult,
    FrameAnalysis,
    Landmark3D,
    VideoMetadata,
)
from app.schemas.jobs import AnalysisStatus
from app.services.video_service import iter_sampled_frames
from app.utils.timestamps import sample_timestamps_ms

# Canonical-ish 478-point template: a unit oval plus iris rings.
_TEMPLATE = None


def _template() -> np.ndarray:
    global _TEMPLATE
    if _TEMPLATE is not None:
        return _TEMPLATE
    pts = np.zeros((478, 3), dtype=np.float64)
    for i in range(468):
        ang = 2 * math.pi * (i / 468)
        ring = 0.18 + 0.10 * ((i % 12) / 12)
        pts[i, 0] = 0.5 + ring * math.cos(ang)
        pts[i, 1] = 0.42 + ring * 1.15 * math.sin(ang)
        pts[i, 2] = 0.02 * math.sin(3 * ang)
    # Left / right iris centers and rings
    pts[468] = (0.37, 0.40, 0.0)
    pts[473] = (0.63, 0.40, 0.0)
    for k, center in ((468, pts[468]), (473, pts[473])):
        for j in range(1, 5):
            ang = 2 * math.pi * (j / 4)
            pts[k + j] = (
                center[0] + 0.015 * math.cos(ang),
                center[1] + 0.010 * math.sin(ang),
                0.0,
            )
    _TEMPLATE = pts
    return pts


BLENDSHAPE_NAMES = [
    "browDownLeft",
    "browDownRight",
    "browInnerUp",
    "browOuterUpLeft",
    "browOuterUpRight",
    "cheekPuff",
    "cheekSquintLeft",
    "cheekSquintRight",
    "eyeBlinkLeft",
    "eyeBlinkRight",
    "eyeLookDownLeft",
    "eyeLookDownRight",
    "eyeLookInLeft",
    "eyeLookInRight",
    "eyeLookOutLeft",
    "eyeLookOutRight",
    "eyeLookUpLeft",
    "eyeLookUpRight",
    "eyeSquintLeft",
    "eyeSquintRight",
    "eyeWideLeft",
    "eyeWideRight",
    "jawForward",
    "jawLeft",
    "jawOpen",
    "jawRight",
    "mouthClose",
    "mouthDimpleLeft",
    "mouthDimpleRight",
    "mouthFrownLeft",
    "mouthFrownRight",
    "mouthFunnel",
    "mouthLeft",
    "mouthLowerDownLeft",
    "mouthLowerDownRight",
    "mouthPressLeft",
    "mouthPressRight",
    "mouthPucker",
    "mouthRight",
    "mouthRollLower",
    "mouthRollUpper",
    "mouthShrugLower",
    "mouthShrugUpper",
    "mouthSmileLeft",
    "mouthSmileRight",
    "mouthStretchLeft",
    "mouthStretchRight",
    "mouthUpperUpLeft",
    "mouthUpperUpRight",
    "noseSneerLeft",
    "noseSneerRight",
    "tongueOut",
]


class MockAnalyzer:
    """Deterministic synthetic analyzer. Enabled only when ANALYZER=mock."""

    name = "mock"
    mock = True

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
                "phase": "Preparing mock analysis",
                "progress": 0.05,
                "duration_ms": video.duration_ms,
                "processed_ms": 0,
            }
        )
        stamps = [ts for ts, _ in _timestamps(video_path, video, config)]
        frames: list[FrameAnalysis] = []
        duration = max(1, video.duration_ms)
        for i, ts in enumerate(stamps):
            if cancel_event.is_set():
                from app.api.errors import AppError
                from app.schemas.errors import ErrorCode

                raise AppError(ErrorCode.CANCELLED, "Analysis was cancelled.", status_code=499)
            frames.append(synthetic_frame(ts, duration, gap_start=4000, gap_end=5500))
            progress(
                {
                    "status": AnalysisStatus.analyzing,
                    "phase": "Detecting facial landmarks",
                    "progress": 0.1 + 0.7 * (ts / duration),
                    "processed_ms": ts,
                    "duration_ms": duration,
                }
            )
        progress(
            {
                "status": AnalysisStatus.aggregating,
                "phase": "Aggregating windows and scores",
                "progress": 0.88,
            }
        )
        return finalize_result(
            frames=frames,
            video=video,
            config=config,
            analysis_id=analysis_id,
            created_at=created_at,
            mediapipe_version="mock",
            model_version="mock",
            model_asset_id="mock",
            model_checksum=None,
            analyzer="mock",
            mock=True,
            backend_version=self.settings.backend_version,
        )


def _timestamps(video_path: Path, video: VideoMetadata, config: AnalysisConfig):
    try:
        yielded = False
        for item in iter_sampled_frames(video_path, config.analysis_fps, video.duration_ms):
            yielded = True
            yield item[0], item[1]
        if not yielded:
            for ts in sample_timestamps_ms(video.duration_ms, config.analysis_fps):
                yield ts, None
    except Exception:
        for ts in sample_timestamps_ms(video.duration_ms, config.analysis_fps):
            yield ts, None


def synthetic_frame(
    timestamp_ms: int,
    duration_ms: int,
    gap_start: int = 4000,
    gap_end: int = 5500,
) -> FrameAnalysis:
    # Explicit missing-data region: landmarks remain null, scores must not become 0.
    if gap_start <= timestamp_ms < gap_end:
        quality = frame_quality(None, None, None, None)
        return FrameAnalysis(
            timestamp_ms=timestamp_ms,
            landmarks=None,
            blendshapes=None,
            facial_transformation_matrix=None,
            head_pose=None,
            gaze=None,
            quality=quality,
        )

    t = timestamp_ms / 1000.0
    progress = timestamp_ms / max(1, duration_ms)
    yaw = 18.0 * math.sin(t * 0.7)
    if 12.0 <= t <= 18.0:
        yaw = -28.0
    pitch = 6.0 * math.sin(t * 0.45 + 0.4)
    roll = 3.0 * math.sin(t * 1.1)
    R = yaw_pitch_roll_to_rotation(yaw, pitch, roll)
    matrix = np.eye(4)
    matrix[:3, :3] = R
    matrix[:3, 3] = [0.0, 0.0, 40.0]

    pts = _template().copy()
    pts[:, 0] += 0.015 * math.sin(t)
    pts[:, 1] += 0.008 * math.cos(t * 0.8)
    # Iris shift for gaze
    gaze_h = 0.55 * math.sin(t * 0.5) if 12 <= t <= 18 else 0.08 * math.sin(t)
    pts[468, 0] += 0.01 * gaze_h
    pts[473, 0] += 0.01 * gaze_h
    landmarks = [Landmark3D(x=float(p[0]), y=float(p[1]), z=float(p[2])) for p in pts]

    smile = 0.15 + 0.45 * max(0.0, math.sin(t * 0.9))
    if progress > 0.7:
        smile = 0.05
    blink = 0.85 if int(t * 3) % 17 == 0 else 0.04
    blendshapes = {name: 0.03 for name in BLENDSHAPE_NAMES}
    blendshapes["mouthSmileLeft"] = smile
    blendshapes["mouthSmileRight"] = smile * 0.96
    blendshapes["browInnerUp"] = 0.2 + 0.3 * max(0.0, math.sin(t * 0.6 + 1.2))
    blendshapes["eyeWideLeft"] = 0.1 * (1 - blink)
    blendshapes["eyeWideRight"] = 0.1 * (1 - blink)
    blendshapes["eyeBlinkLeft"] = blink
    blendshapes["eyeBlinkRight"] = blink
    blendshapes["jawOpen"] = 0.12 + 0.25 * max(0.0, math.sin(t * 1.7))

    pose = head_pose_from_matrix(matrix)
    gaze = estimate_gaze(landmarks_to_array(landmarks), pose)
    quality = frame_quality(landmarks, blendshapes, pose, gaze)
    return FrameAnalysis(
        timestamp_ms=timestamp_ms,
        landmarks=landmarks,
        blendshapes=blendshapes,
        facial_transformation_matrix=[float(v) for v in matrix.reshape(-1)],
        head_pose=pose,
        gaze=gaze,
        quality=quality,
    )
