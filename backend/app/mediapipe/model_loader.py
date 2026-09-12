from __future__ import annotations

import hashlib
import logging
from pathlib import Path
from urllib.request import urlopen

from app.api.errors import AppError
from app.core.config import Settings
from app.schemas.errors import ErrorCode

logger = logging.getLogger(__name__)


def ensure_model(settings: Settings) -> Path:
    path = Path(settings.face_landmarker_path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.stat().st_size > 1000:
        return path
    logger.info("Downloading Face Landmarker model to %s", path)
    try:
        with urlopen(settings.face_landmarker_url, timeout=60) as response:
            data = response.read()
        if len(data) < 1000:
            raise RuntimeError("Downloaded model file is unexpectedly small")
        path.write_bytes(data)
    except Exception as exc:
        raise AppError(
            ErrorCode.MODEL_INITIALIZATION_FAILED,
            "Failed to download the MediaPipe Face Landmarker model.",
            status_code=500,
            details={"reason": str(exc)},
        ) from exc
    return path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()
