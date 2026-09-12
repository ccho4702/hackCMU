from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import UploadFile

from backend.app.analyzers.mediapipe_analyzer import MediaPipeAnalyzer
from backend.app.analyzers.mock_analyzer import MockAnalyzer
from backend.app.api.errors import AppError
from backend.app.core.config import Settings
from backend.app.export.csv import result_to_json_bytes, windows_to_csv
from backend.app.schemas.analysis import AnalysisConfig, AnalysisResult, AnalysisResultLite, VideoMetadata
from backend.app.schemas.errors import ErrorCode
from backend.app.schemas.jobs import AnalysisAccepted, AnalysisProgress, AnalysisStatus, TERMINAL_STATUSES
from backend.app.services.job_runner import JobRunner
from backend.app.services.video_service import probe_video, validate_upload_meta
from backend.app.storage.analysis_store import FilesystemAnalysisRepository
from backend.app.storage.temporary_files import TemporaryFileStore
from backend.app.utils.ids import analysis_id as make_analysis_id
from backend.app.utils.ids import sanitize_filename, video_id as make_video_id

logger = logging.getLogger(__name__)


class AnalysisService:
    def __init__(
        self,
        settings: Settings,
        files: TemporaryFileStore,
        repo: FilesystemAnalysisRepository,
        runner: JobRunner,
    ):
        self.settings = settings
        self.files = files
        self.repo = repo
        self.runner = runner
        analyzer_name = settings.analyzer.strip().lower()
        if analyzer_name == "mock":
            self.analyzer = MockAnalyzer(settings)
        elif analyzer_name == "mediapipe":
            self.analyzer = MediaPipeAnalyzer(settings)
        else:
            raise RuntimeError(f"Unknown analyzer '{settings.analyzer}'")

    def create_from_upload(
        self,
        upload: UploadFile,
        analysis_config_raw: str | None,
        threshold_config_raw: str | None,
    ) -> AnalysisAccepted:
        config = _parse_config(analysis_config_raw, threshold_config_raw)
        filename = sanitize_filename(upload.filename)
        analysis_id = make_analysis_id()
        dest = self.files.input_path(analysis_id, filename)
        size = _write_upload(upload, dest)
        validate_upload_meta(
            filename=filename,
            content_type=upload.content_type,
            size_bytes=size,
            settings=self.settings,
        )
        self.repo.create(
            analysis_id,
            original_filename=filename,
            file_size_bytes=size,
            config=config,
            mock=self.analyzer.mock,
        )
        self.runner.submit(analysis_id, lambda event: self._run(analysis_id, dest, event))
        return AnalysisAccepted(analysis_id=analysis_id, status=AnalysisStatus.queued)

    def get_progress(self, analysis_id: str) -> AnalysisProgress:
        progress = self.repo.get_progress(analysis_id)
        if progress is None:
            result = self.repo.get_result(analysis_id)
            if result is None:
                raise AppError(
                    ErrorCode.ANALYSIS_NOT_FOUND,
                    "Analysis not found.",
                    status_code=404,
                )
            return AnalysisProgress(
                analysis_id=analysis_id,
                status=AnalysisStatus.completed,
                progress=1.0,
                phase="Completed",
                duration_ms=result.video.duration_ms,
                processed_ms=result.video.duration_ms,
                mock=result.provenance.mock,
            )
        return progress

    def get_result(self, analysis_id: str, include_frames: bool = True) -> AnalysisResult:
        self._require_completed(analysis_id)
        result = self.repo.get_result(analysis_id)
        if result is None:
            raise AppError(ErrorCode.ANALYSIS_NOT_FOUND, "Analysis not found.", status_code=404)
        if include_frames:
            return result
        return result.model_copy(update={"frames": []})

    def get_result_lite(self, analysis_id: str) -> AnalysisResultLite:
        result = self.get_result(analysis_id, include_frames=False)
        return AnalysisResultLite(
            schema_version=result.schema_version,
            analysis_id=result.analysis_id,
            video=result.video,
            provenance=result.provenance,
            config=result.config,
            quality=result.quality,
            summary=result.summary,
            segments=result.segments,
            windows=result.windows,
            alerts=result.alerts,
            frame_count=len(self.repo.get_result(analysis_id).frames) if self.repo.get_result(analysis_id) else 0,
        )

    def get_windows(self, analysis_id: str):
        return self.get_result(analysis_id, include_frames=False).windows

    def get_frames(self, analysis_id: str, start_ms: int | None = None, end_ms: int | None = None):
        result = self.get_result(analysis_id, include_frames=True)
        frames = result.frames
        if start_ms is not None:
            frames = [f for f in frames if f.timestamp_ms >= start_ms]
        if end_ms is not None:
            frames = [f for f in frames if f.timestamp_ms <= end_ms]
        return frames

    def export_json(self, analysis_id: str, include_frames: bool) -> bytes:
        result = self.get_result(analysis_id, include_frames=True)
        try:
            return result_to_json_bytes(result, include_frames=include_frames)
        except Exception as exc:
            raise AppError(ErrorCode.EXPORT_FAILED, "JSON export failed.") from exc

    def export_csv(self, analysis_id: str) -> str:
        result = self.get_result(analysis_id, include_frames=False)
        try:
            return windows_to_csv(result)
        except Exception as exc:
            raise AppError(ErrorCode.EXPORT_FAILED, "CSV export failed.") from exc

    def delete(self, analysis_id: str) -> None:
        progress = self.repo.get_progress(analysis_id)
        if progress and progress.status not in TERMINAL_STATUSES:
            self.runner.cancel(analysis_id)
            try:
                self.repo.update_progress(
                    analysis_id,
                    status=AnalysisStatus.cancelled,
                    phase="Cancelled",
                    error_code=ErrorCode.CANCELLED.value,
                    error_message="Analysis was cancelled.",
                )
            except KeyError:
                pass
        self.repo.delete(analysis_id)

    def _require_completed(self, analysis_id: str) -> None:
        progress = self.repo.get_progress(analysis_id)
        result = self.repo.get_result(analysis_id)
        if result is not None:
            return
        if progress is None:
            raise AppError(ErrorCode.ANALYSIS_NOT_FOUND, "Analysis not found.", status_code=404)
        if progress.status == AnalysisStatus.failed:
            raise AppError(
                progress.error_code or ErrorCode.ANALYSIS_FAILED.value,
                progress.error_message or "Analysis failed.",
                status_code=409,
            )
        if progress.status == AnalysisStatus.cancelled:
            raise AppError(ErrorCode.CANCELLED, "Analysis was cancelled.", status_code=409)
        raise AppError(
            ErrorCode.ANALYSIS_NOT_READY,
            "Analysis is still running.",
            status_code=409,
            details={"status": progress.status.value},
        )

    def _run(self, analysis_id: str, dest, cancel_event) -> None:
        def on_progress(update: dict[str, Any]) -> None:
            if cancel_event.is_set():
                return
            try:
                self.repo.update_progress(analysis_id, **update)
            except KeyError:
                return

        try:
            on_progress(
                {
                    "status": AnalysisStatus.preparing,
                    "phase": "Validating video",
                    "progress": 0.02,
                }
            )
            info = probe_video(dest, self.settings)
            config = self.repo.get_config(analysis_id)
            filename = self.repo.get_filename(analysis_id) or dest.name
            if config is None:
                raise AppError(ErrorCode.ANALYSIS_FAILED, "Missing analysis configuration.")
            video = VideoMetadata(
                video_id=make_video_id(),
                file_name=filename,
                duration_ms=info.duration_ms,
                width=info.width,
                height=info.height,
                file_size_bytes=info.file_size_bytes,
                source_fps=info.source_fps,
            )
            on_progress({"duration_ms": info.duration_ms, "processed_ms": 0})
            created_at = datetime.now(timezone.utc).isoformat()
            result = self.analyzer.analyze(
                dest,
                video,
                config,
                analysis_id=analysis_id,
                created_at=created_at,
                cancel_event=cancel_event,
                progress=on_progress,
            )
            if cancel_event.is_set():
                on_progress(
                    {
                        "status": AnalysisStatus.cancelled,
                        "phase": "Cancelled",
                        "error_code": ErrorCode.CANCELLED.value,
                    }
                )
                return
            self.repo.save_result(result)
            on_progress(
                {
                    "status": AnalysisStatus.completed,
                    "phase": "Completed",
                    "progress": 1.0,
                    "processed_ms": video.duration_ms,
                    "duration_ms": video.duration_ms,
                }
            )
        except AppError as exc:
            logger.warning("Analysis %s failed: %s", analysis_id, exc.message)
            if cancel_event.is_set() or exc.code == ErrorCode.CANCELLED.value:
                status = AnalysisStatus.cancelled
                phase = "Cancelled"
            else:
                status = AnalysisStatus.failed
                phase = "Failed"
            try:
                self.repo.update_progress(
                    analysis_id,
                    status=status,
                    phase=phase,
                    error_code=exc.code,
                    error_message=exc.message,
                )
            except KeyError:
                return
        except Exception:
            logger.exception("Analysis %s crashed", analysis_id)
            try:
                self.repo.update_progress(
                    analysis_id,
                    status=AnalysisStatus.failed,
                    phase="Failed",
                    error_code=ErrorCode.ANALYSIS_FAILED.value,
                    error_message="Analysis failed while processing the video.",
                )
            except KeyError:
                return


def _parse_config(
    analysis_config_raw: str | None,
    threshold_config_raw: str | None,
) -> AnalysisConfig:
    payload: dict[str, Any] = {}
    if analysis_config_raw:
        try:
            payload = json.loads(analysis_config_raw)
        except json.JSONDecodeError as exc:
            raise AppError(ErrorCode.INVALID_CONFIG, "analysisConfig is not valid JSON.") from exc
    if threshold_config_raw:
        try:
            payload["thresholds"] = json.loads(threshold_config_raw)
        except json.JSONDecodeError as exc:
            raise AppError(ErrorCode.INVALID_CONFIG, "thresholdConfig is not valid JSON.") from exc
    try:
        return AnalysisConfig.model_validate(payload)
    except Exception as exc:
        raise AppError(ErrorCode.INVALID_CONFIG, "Invalid analysis configuration.") from exc


def _write_upload(upload: UploadFile, dest) -> int:
    size = 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("wb") as handle:
        while True:
            chunk = upload.file.read(1024 * 1024)
            if not chunk:
                break
            handle.write(chunk)
            size += len(chunk)
    return size
