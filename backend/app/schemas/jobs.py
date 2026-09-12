from enum import Enum

from backend.app.schemas.common import APIModel


class AnalysisStatus(str, Enum):
    queued = "queued"
    preparing = "preparing"
    analyzing = "analyzing"
    aggregating = "aggregating"
    finalizing = "finalizing"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


TERMINAL_STATUSES = {
    AnalysisStatus.completed,
    AnalysisStatus.failed,
    AnalysisStatus.cancelled,
}


class AnalysisAccepted(APIModel):
    analysis_id: str
    status: AnalysisStatus = AnalysisStatus.queued


class AnalysisProgress(APIModel):
    analysis_id: str
    status: AnalysisStatus
    progress: float = 0.0
    phase: str = "Queued"
    processed_ms: int | None = None
    duration_ms: int | None = None
    error_code: str | None = None
    error_message: str | None = None
    mock: bool = False
