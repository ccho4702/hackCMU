from __future__ import annotations

import shutil
from pathlib import Path

from app.core.config import Settings
from app.utils.ids import sanitize_filename


class TemporaryFileStore:
    """Filesystem-backed temp storage. Swap later for S3/GCS without pipeline changes."""

    def __init__(self, settings: Settings):
        self.root = Path(settings.temp_storage_path)
        self.root.mkdir(parents=True, exist_ok=True)

    def analysis_dir(self, analysis_id: str) -> Path:
        path = self.root / analysis_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def existing_dir(self, analysis_id: str) -> Path | None:
        path = self.root / analysis_id
        return path if path.exists() else None

    def input_path(self, analysis_id: str, filename: str | None = None) -> Path:
        suffix = Path(sanitize_filename(filename)).suffix.lower() or ".mp4"
        if suffix not in {".mp4", ".mov", ".webm", ".mkv", ".m4v", ".avi"}:
            suffix = ".mp4"
        return self.analysis_dir(analysis_id) / f"input{suffix}"

    def result_path(self, analysis_id: str) -> Path:
        return self.analysis_dir(analysis_id) / "result.json"

    def delete(self, analysis_id: str) -> None:
        path = self.root / analysis_id
        if path.exists():
            shutil.rmtree(path, ignore_errors=True)
