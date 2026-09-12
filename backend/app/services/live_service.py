from __future__ import annotations

import logging
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone

import cv2
import numpy as np
from fastapi import UploadFile

from app.analyzers.mediapipe_analyzer import finalize_result, observation_to_frame
from app.analyzers.mock_analyzer import synthetic_frame
from app.api.errors import AppError
from app.core.config import Settings
from app.mediapipe.face_landmarker import FaceLandmarkerSession
from app.mediapipe.model_loader import ensure_model, sha256_file
from app.schemas.analysis import (
    AnalysisConfig,
    FrameAnalysis,
    LiveSessionAccepted,
    LiveSessionStopResult,
    LiveTick,
    VideoMetadata,
    WindowAnalysis,
)
from app.schemas.errors import ErrorCode
from app.schemas.jobs import AnalysisStatus
from app.scoring.alerts import AlertTracker
from app.scoring.heuristic_v1 import HeuristicV1Strategy
from app.scoring.smoothing import smooth_window_metrics
from app.scoring.windows import PreparedFrame, prepare_next_frame, score_time_window
from app.services.analysis_service import AnalysisService
from app.utils.ids import analysis_id as make_analysis_id
from app.utils.ids import video_id as make_video_id

logger = logging.getLogger(__name__)

LIVE_WINDOW_MS = 60_000


@dataclass
class LiveSession:
    analysis_id: str
    config: AnalysisConfig
    created_at: str
    mock: bool
    lock: threading.Lock = field(default_factory=threading.Lock)
    frames: list[FrameAnalysis] = field(default_factory=list)
    prepared: list[PreparedFrame] = field(default_factory=list)
    windows: list[WindowAnalysis] = field(default_factory=list)
    tracker: AlertTracker = field(default_factory=AlertTracker)
    landmarker: FaceLandmarkerSession | None = None
    mediapipe_version: str = "unknown"
    model_version: str = "unknown"
    model_asset_id: str = "unknown"
    model_checksum: str | None = None
    last_timestamp_ms: int = -1
    next_window_end: int = 0
    blendshape_names: list[str] | None = None
    width: int = 0
    height: int = 0
    closed: bool = False
    strategy: HeuristicV1Strategy = field(default_factory=HeuristicV1Strategy)


class LiveSessionService:
    """Streaming analysis that reuses the recorded-video scoring pipeline."""

    def __init__(self, settings: Settings, analysis: AnalysisService):
        self.settings = settings
        self.analysis = analysis
        self._sessions: dict[str, LiveSession] = {}
        self._guard = threading.Lock()

    def create(self) -> LiveSessionAccepted:
        config = AnalysisConfig(
            analysis_fps=12.0,
            window_size_ms=1000,
            stride_ms=250,
        )
        analysis_id = make_analysis_id()
        mock = self.analysis.analyzer.mock
        session = LiveSession(
            analysis_id=analysis_id,
            config=config,
            created_at=datetime.now(timezone.utc).isoformat(),
            mock=mock,
            tracker=AlertTracker(
                enter_ms=config.alert_enter_ms,
                exit_ms=config.alert_exit_ms,
                hysteresis=config.alert_hysteresis,
            ),
        )
        session.next_window_end = config.window_size_ms
        if not mock:
            try:
                import mediapipe as mp

                model_path = ensure_model(self.settings)
                session.landmarker = FaceLandmarkerSession(model_path)
                session.mediapipe_version = getattr(mp, "__version__", "unknown")
                session.model_version = model_path.name
                session.model_asset_id = self.settings.model_asset_id
                session.model_checksum = sha256_file(model_path)
            except AppError:
                raise
            except Exception as exc:
                raise AppError(
                    ErrorCode.MODEL_INITIALIZATION_FAILED,
                    "MediaPipe Face Landmarker failed to initialize for live analysis.",
                    status_code=500,
                    details={"reason": str(exc)},
                ) from exc
        else:
            session.mediapipe_version = "mock"
            session.model_version = "mock"
            session.model_asset_id = "mock"

        self.analysis.repo.create(
            analysis_id,
            original_filename="live-session.webm",
            file_size_bytes=0,
            config=config,
            mock=mock,
        )
        self.analysis.repo.update_progress(
            analysis_id,
            status=AnalysisStatus.analyzing,
            phase="Live analysis",
            progress=0.15,
        )
        with self._guard:
            self._sessions[analysis_id] = session
        return LiveSessionAccepted(
            session_id=analysis_id,
            analysis_id=analysis_id,
            analysis_fps=config.analysis_fps,
            window_size_ms=config.window_size_ms,
            stride_ms=config.stride_ms,
            mock=mock,
        )

    def ingest_frame(self, session_id: str, upload: UploadFile, timestamp_ms: int) -> LiveTick:
        session = self._require(session_id)
        data = upload.file.read()
        if len(data) > self.settings.max_live_frame_bytes:
            raise AppError(ErrorCode.VIDEO_TOO_LARGE, "Live camera frame exceeds the size limit.")
        with session.lock:
            if session.closed:
                raise AppError(
                    ErrorCode.LIVE_SESSION_CLOSED,
                    "This live session has already ended.",
                    status_code=409,
                )
            if timestamp_ms > self.settings.max_live_duration_ms:
                raise AppError(
                    ErrorCode.VIDEO_TOO_LONG,
                    "Live session exceeded the maximum duration.",
                )
            timestamp_ms = max(int(timestamp_ms), session.last_timestamp_ms + 1)
            if session.mock:
                frame = synthetic_frame(timestamp_ms, max(timestamp_ms + 1, 20_000))
            else:
                rgb = _decode_jpeg(data)
                session.height, session.width = rgb.shape[:2]
                if session.landmarker is None:
                    raise AppError(
                        ErrorCode.MODEL_INITIALIZATION_FAILED,
                        "Live Face Landmarker is not available.",
                        status_code=500,
                    )
                observation = session.landmarker.detect(rgb, timestamp_ms)
                frame = observation_to_frame(timestamp_ms, observation)
            prepared, names = prepare_next_frame(
                frame,
                session.frames[-1] if session.frames else None,
                session.blendshape_names,
            )
            session.blendshape_names = names
            session.frames.append(frame)
            session.prepared.append(prepared)
            session.last_timestamp_ms = timestamp_ms
            self._emit_windows(session)
            recent = [
                window
                for window in session.windows
                if window.end_ms >= timestamp_ms - LIVE_WINDOW_MS
            ]
            return LiveTick(
                session_id=session.analysis_id,
                timestamp_ms=timestamp_ms,
                duration_ms=timestamp_ms,
                frame=frame,
                window=session.windows[-1] if session.windows else None,
                windows=recent,
                alerts=session.tracker.active_alerts(),
            )

    def stop(self, session_id: str) -> LiveSessionStopResult:
        session = self._require(session_id)
        with session.lock:
            if session.closed:
                raise AppError(
                    ErrorCode.LIVE_SESSION_CLOSED,
                    "This live session has already ended.",
                    status_code=409,
                )
            session.closed = True
            if session.landmarker is not None:
                session.landmarker.close()
                session.landmarker = None
            if not session.frames:
                self.analysis.repo.update_progress(
                    session.analysis_id,
                    status=AnalysisStatus.failed,
                    phase="Failed",
                    error_code=ErrorCode.INSUFFICIENT_VALID_DATA.value,
                    error_message="No camera frames were received.",
                )
                self._drop(session_id)
                raise AppError(
                    ErrorCode.INSUFFICIENT_VALID_DATA,
                    "No camera frames were received.",
                )
            duration_ms = max(session.frames[-1].timestamp_ms, 1)
            video = VideoMetadata(
                video_id=make_video_id(),
                file_name="live-session.webm",
                duration_ms=duration_ms,
                width=session.width or 1280,
                height=session.height or 720,
                file_size_bytes=0,
                source_fps=session.config.analysis_fps,
                source="live",
            )
            try:
                result = finalize_result(
                    frames=session.frames,
                    video=video,
                    config=session.config,
                    analysis_id=session.analysis_id,
                    created_at=session.created_at,
                    mediapipe_version=session.mediapipe_version,
                    model_version=session.model_version,
                    model_asset_id=session.model_asset_id,
                    model_checksum=session.model_checksum,
                    analyzer="mock" if session.mock else "mediapipe",
                    mock=session.mock,
                    backend_version=self.settings.backend_version,
                )
            except AppError as exc:
                self.analysis.repo.update_progress(
                    session.analysis_id,
                    status=AnalysisStatus.failed,
                    phase="Failed",
                    error_code=exc.code,
                    error_message=exc.message,
                )
                self._drop(session_id)
                raise
            self.analysis.repo.save_result(result)
            self.analysis.repo.update_progress(
                session.analysis_id,
                status=AnalysisStatus.completed,
                phase="Completed",
                progress=1.0,
                processed_ms=duration_ms,
                duration_ms=duration_ms,
            )
        self._drop(session_id)
        return LiveSessionStopResult(analysis_id=session.analysis_id)

    def _emit_windows(self, session: LiveSession) -> None:
        config = session.config
        last_ts = session.last_timestamp_ms
        while last_ts >= session.next_window_end:
            end = session.next_window_end
            start = end - config.window_size_ms
            raw = score_time_window(
                session.prepared,
                start,
                end,
                minimum_valid_coverage=config.minimum_valid_coverage,
                strategy=session.strategy,
                config=config,
            )
            prev = session.windows[-1] if session.windows else None
            smoothed = (
                smooth_window_metrics([prev, raw], config.smoothing_alpha)[-1]
                if prev is not None
                else raw
            )
            session.windows.append(smoothed)
            session.tracker.observe(end, _scores(smoothed), config.thresholds)
            session.next_window_end += config.stride_ms

    def _require(self, session_id: str) -> LiveSession:
        with self._guard:
            session = self._sessions.get(session_id)
        if session is None:
            raise AppError(
                ErrorCode.LIVE_SESSION_NOT_FOUND,
                "Live session not found.",
                status_code=404,
            )
        return session

    def _drop(self, session_id: str) -> None:
        with self._guard:
            self._sessions.pop(session_id, None)


def _decode_jpeg(data: bytes) -> np.ndarray:
    arr = np.frombuffer(data, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise AppError(ErrorCode.INVALID_VIDEO, "Could not decode the camera frame.")
    return cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)


def _scores(window: WindowAnalysis | None) -> dict[str, int | None]:
    if window is None:
        return {
            "gaze": None,
            "expression_activity": None,
            "stability": None,
            "expressiveness": None,
        }
    return {
        "gaze": window.metrics.gaze,
        "expression_activity": window.metrics.expression_activity,
        "stability": window.metrics.stability,
        "expressiveness": window.metrics.expressiveness,
    }
