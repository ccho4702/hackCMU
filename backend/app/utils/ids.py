from __future__ import annotations

import re
import uuid

_SAFE_NAME = re.compile(r"[^A-Za-z0-9._-]+")


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def analysis_id() -> str:
    return new_id("anl")


def video_id() -> str:
    return new_id("vid")


def segment_id(index: int) -> str:
    return f"seg_{index:03d}"


def sanitize_filename(name: str | None, fallback: str = "upload.mp4") -> str:
    if not name:
        return fallback
    base = name.replace("\\", "/").split("/")[-1]
    cleaned = _SAFE_NAME.sub("_", base).strip("._")
    if not cleaned:
        return fallback
    return cleaned[:180]
