from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from app.api.errors import AppError
from app.core.config import Settings
from app.schemas.errors import ErrorCode

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".mp4", ".mov", ".webm", ".mkv", ".m4v"}
ALLOWED_MIME = {
    "video/mp4",
    "video/quicktime",
    "video/webm",
    "video/x-matroska",
    "video/x-m4v",
    "application/octet-stream",
}


@dataclass(frozen=True)
class VideoInfo:
    path: Path
    width: int
    height: int
    duration_ms: int
    source_fps: float | None
    frame_count: int
    file_size_bytes: int


def sniff_container(path: Path) -> str | None:
    header = path.read_bytes()[:16]
    if len(header) >= 12 and header[4:8] == b"ftyp":
        return "mp4"
    if header.startswith(b"\x1a\x45\xdf\xa3"):
        return "ebml"
    if header.startswith(b"RIFF") and b"AVI" in header:
        return "avi"
    return None


def validate_upload_meta(
    *,
    filename: str | None,
    content_type: str | None,
    size_bytes: int,
    settings: Settings,
) -> None:
    if size_bytes <= 0:
        raise AppError(ErrorCode.INVALID_VIDEO, "Uploaded file is empty.")
    if size_bytes > settings.max_upload_bytes:
        raise AppError(
            ErrorCode.VIDEO_TOO_LARGE,
            "Video exceeds the maximum upload size.",
            details={
                "maxBytes": settings.max_upload_bytes,
                "sizeBytes": size_bytes,
            },
        )
    suffix = Path(filename or "").suffix.lower()
    if suffix and suffix not in ALLOWED_EXTENSIONS:
        raise AppError(
            ErrorCode.INVALID_VIDEO,
            "Unsupported video container. Use MP4, MOV, or WebM.",
            details={"filename": filename},
        )
    if content_type and content_type.split(";")[0].strip().lower() not in ALLOWED_MIME:
        # Still allow if extension is known; decoder is authoritative.
        if suffix not in ALLOWED_EXTENSIONS:
            raise AppError(
                ErrorCode.INVALID_VIDEO,
                "Unsupported video MIME type.",
                details={"contentType": content_type},
            )


def probe_video(path: Path, settings: Settings) -> VideoInfo:
    if sniff_container(path) is None and path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise AppError(
            ErrorCode.INVALID_VIDEO,
            "File does not appear to be a supported video container.",
        )

    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise AppError(
            ErrorCode.UNSUPPORTED_VIDEO_CODEC,
            "This video codec could not be decoded.",
        )
    try:
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        ok, frame = cap.read()
        if not ok or frame is None:
            raise AppError(
                ErrorCode.UNSUPPORTED_VIDEO_CODEC,
                "The file opened but no video frames could be decoded.",
            )
        if width <= 0 or height <= 0:
            height, width = frame.shape[:2]
        if width > settings.max_width or height > settings.max_height:
            raise AppError(
                ErrorCode.INVALID_VIDEO,
                "Video dimensions exceed the supported limit.",
                details={"width": width, "height": height},
            )
        if fps > 1e-3 and frame_count > 0:
            duration_ms = int(round(1000.0 * frame_count / fps))
        else:
            duration_ms = _scan_duration_ms(cap)
        if duration_ms < settings.min_duration_ms:
            raise AppError(
                ErrorCode.VIDEO_TOO_SHORT,
                "Video is too short to analyze.",
                details={"durationMs": duration_ms},
            )
        if duration_ms > settings.max_duration_ms:
            raise AppError(
                ErrorCode.VIDEO_TOO_LONG,
                "Video exceeds the maximum analysis duration.",
                details={"durationMs": duration_ms},
            )
        return VideoInfo(
            path=path,
            width=width,
            height=height,
            duration_ms=duration_ms,
            source_fps=fps if fps > 1e-3 else None,
            frame_count=frame_count,
            file_size_bytes=path.stat().st_size,
        )
    finally:
        cap.release()


def _scan_duration_ms(cap: cv2.VideoCapture) -> int:
    last = 0.0
    for _ in range(10_000):
        ok = cap.grab()
        if not ok:
            break
        pos = cap.get(cv2.CAP_PROP_POS_MSEC)
        if pos and pos > last:
            last = pos
    return int(round(last))


def iter_sampled_frames(
    path: Path,
    analysis_fps: float,
    duration_ms: int,
):
    """Yield (timestamp_ms, rgb_frame) using decoder timestamps.

    Does not load the entire video into memory.
    """
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise AppError(
            ErrorCode.UNSUPPORTED_VIDEO_CODEC,
            "This video codec could not be decoded.",
        )
    interval = 1000.0 / max(analysis_fps, 1.0)
    next_sample_at = 0.0
    last_emitted: int | None = None
    fallback_index = 0
    source_fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    try:
        while True:
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            pos = float(cap.get(cv2.CAP_PROP_POS_MSEC) or -1.0)
            if pos < 0:
                if source_fps > 1e-3:
                    pos = 1000.0 * fallback_index / source_fps
                else:
                    pos = fallback_index * interval
            fallback_index += 1
            if pos + 0.5 < next_sample_at:
                continue
            ts = int(round(pos))
            if last_emitted is not None and ts <= last_emitted:
                ts = last_emitted + 1
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            if not rgb.flags["C_CONTIGUOUS"]:
                rgb = np.ascontiguousarray(rgb)
            yield ts, rgb
            last_emitted = ts
            next_sample_at += interval
            if duration_ms and ts >= duration_ms + interval:
                break
    finally:
        cap.release()
