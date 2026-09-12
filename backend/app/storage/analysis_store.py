from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Protocol

from app.schemas.analysis import AnalysisConfig, AnalysisResult
from app.schemas.jobs import AnalysisProgress, AnalysisStatus
from app.storage.temporary_files import TemporaryFileStore


class AnalysisRepository(Protocol):
    def create(
        self,
        analysis_id: str,
        *,
        original_filename: str,
        file_size_bytes: int,
        config: AnalysisConfig,
        mock: bool,
    ) -> AnalysisProgress: ...

    def get_progress(self, analysis_id: str) -> AnalysisProgress | None: ...

    def update_progress(self, analysis_id: str, **kwargs) -> AnalysisProgress: ...

    def save_result(self, result: AnalysisResult) -> None: ...

    def get_result(self, analysis_id: str) -> AnalysisResult | None: ...

    def delete(self, analysis_id: str) -> bool: ...

    def get_config(self, analysis_id: str) -> AnalysisConfig | None: ...

    def get_filename(self, analysis_id: str) -> str | None: ...


@dataclass
class _Record:
    progress: AnalysisProgress
    config: AnalysisConfig
    original_filename: str
    file_size_bytes: int
    created_at: str
    result: AnalysisResult | None = None
    lock: threading.Lock = field(default_factory=threading.Lock)


class FilesystemAnalysisRepository:
    """In-memory job index + filesystem result persistence."""

    def __init__(self, files: TemporaryFileStore):
        self._files = files
        self._records: dict[str, _Record] = {}
        self._guard = threading.Lock()

    def create(
        self,
        analysis_id: str,
        *,
        original_filename: str,
        file_size_bytes: int,
        config: AnalysisConfig,
        mock: bool,
    ) -> AnalysisProgress:
        progress = AnalysisProgress(
            analysis_id=analysis_id,
            status=AnalysisStatus.queued,
            progress=0.0,
            phase="Queued",
            mock=mock,
        )
        record = _Record(
            progress=progress,
            config=config,
            original_filename=original_filename,
            file_size_bytes=file_size_bytes,
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        with self._guard:
            self._records[analysis_id] = record
        self._write_progress(analysis_id, progress)
        self._write_meta(record, analysis_id)
        return progress

    def get_progress(self, analysis_id: str) -> AnalysisProgress | None:
        record = self._record(analysis_id)
        if record:
            return record.progress.model_copy()
        directory = self._files.existing_dir(analysis_id)
        if directory is None:
            return None
        path = directory / "progress.json"
        if path.exists():
            return AnalysisProgress.model_validate_json(path.read_text())
        return None

    def update_progress(self, analysis_id: str, **kwargs) -> AnalysisProgress:
        record = self._require(analysis_id)
        with record.lock:
            data = record.progress.model_dump()
            data.update(kwargs)
            record.progress = AnalysisProgress.model_validate(data)
            progress = record.progress.model_copy()
        self._write_progress(analysis_id, progress)
        return progress

    def save_result(self, result: AnalysisResult) -> None:
        record = self._require(result.analysis_id)
        with record.lock:
            record.result = result
        path = self._files.result_path(result.analysis_id)
        path.write_text(result.model_dump_json(by_alias=True, indent=None))

    def get_result(self, analysis_id: str) -> AnalysisResult | None:
        record = self._record(analysis_id)
        if record and record.result is not None:
            return record.result
        path = self._files.result_path(analysis_id)
        if not path.exists():
            return None
        result = AnalysisResult.model_validate(json.loads(path.read_text()))
        if record:
            with record.lock:
                record.result = result
        return result

    def delete(self, analysis_id: str) -> bool:
        with self._guard:
            existed = analysis_id in self._records
            self._records.pop(analysis_id, None)
        self._files.delete(analysis_id)
        return existed or self._files.result_path(analysis_id).exists()

    def get_config(self, analysis_id: str) -> AnalysisConfig | None:
        record = self._record(analysis_id)
        if record:
            return record.config
        meta = self._read_meta(analysis_id)
        return AnalysisConfig.model_validate(meta["config"]) if meta else None

    def get_filename(self, analysis_id: str) -> str | None:
        record = self._record(analysis_id)
        if record:
            return record.original_filename
        meta = self._read_meta(analysis_id)
        return meta.get("originalFilename") if meta else None

    def _write_progress(self, analysis_id: str, progress: AnalysisProgress) -> None:
        path = self._files.analysis_dir(analysis_id) / "progress.json"
        path.write_text(progress.model_dump_json(by_alias=True))

    def _write_meta(self, record: _Record, analysis_id: str) -> None:
        path = self._files.analysis_dir(analysis_id) / "meta.json"
        path.write_text(
            json.dumps(
                {
                    "originalFilename": record.original_filename,
                    "fileSizeBytes": record.file_size_bytes,
                    "createdAt": record.created_at,
                    "config": record.config.model_dump(by_alias=True),
                }
            )
        )

    def _read_meta(self, analysis_id: str) -> dict | None:
        path = self._files.existing_dir(analysis_id)
        if path is None:
            return None
        meta_path = path / "meta.json"
        if not meta_path.exists():
            return None
        return json.loads(meta_path.read_text())

    def _record(self, analysis_id: str) -> _Record | None:
        with self._guard:
            return self._records.get(analysis_id)

    def _require(self, analysis_id: str) -> _Record:
        record = self._record(analysis_id)
        if record is None:
            raise KeyError(analysis_id)
        return record
