"""Mongo media paths are relative to DATA_DIR; only media files are served."""
from __future__ import annotations

import os
import re
import shutil
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException
from backend.common.config import ROOT, artifacts_dir
from backend.common.media import run_media_command

_configured = os.getenv("DATA_DIR")
DATA_DIR = (ROOT / _configured).resolve() if _configured else artifacts_dir() / "db-media"
EXTENSIONS = {".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg", ".mp4", ".webm", ".mov", ".mkv"}


def valid_stem(value: str) -> bool:
    return isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,128}", value) is not None


def abs_path(rel: str) -> Path:
    base = DATA_DIR.resolve()
    target = (base / rel).resolve()
    if not target.is_relative_to(base) or target == base:
        raise HTTPException(400, "Invalid media path")
    return target


def ensure_dir(rel_dir: str) -> Path:
    directory = abs_path(rel_dir)
    directory.mkdir(parents=True, exist_ok=True)
    return directory


def url(rel: str | None) -> str | None:
    return f"/api/media/{quote(rel, safe='/')}" if rel else None


def save_upload(upload, rel_dir: str, stem: str) -> str:
    if not valid_stem(stem):
        raise HTTPException(400, "Invalid sentence ID")
    ext = Path(upload.filename or "").suffix.lower()
    if ext not in EXTENSIONS:
        raise HTTPException(415, "Upload a supported audio or video file")
    destination = abs_path(f"{rel_dir}/{stem}{ext}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    limit = int(os.getenv("MAX_UPLOAD_MB", "100")) * 1024 * 1024
    size = 0
    try:
        with destination.open("wb") as stream:
            while chunk := upload.file.read(1024 * 1024):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(413, "Recording exceeds MAX_UPLOAD_MB")
                stream.write(chunk)
        if not size:
            raise HTTPException(400, "Recording is empty")
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return str(destination.relative_to(DATA_DIR.resolve()))


def to_wav16k(rel_src: str, rel_dst: str) -> str:
    source, destination = abs_path(rel_src), abs_path(rel_dst)
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        run_media_command(["-y", "-i", str(source), "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(destination)])
    except (ValueError, TimeoutError) as exc:
        destination.unlink(missing_ok=True)
        raise HTTPException(422, "Could not decode the recording") from exc
    return str(destination.relative_to(DATA_DIR.resolve()))


def duration_sec(rel: str) -> float:
    import soundfile as sf
    return round(float(sf.info(str(abs_path(rel))).duration), 3)


def remove_dir(rel_dir: str) -> None:
    shutil.rmtree(abs_path(rel_dir), ignore_errors=True)
