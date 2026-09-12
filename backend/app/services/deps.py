from functools import lru_cache

from backend.app.core.config import get_settings
from backend.app.services.analysis_service import AnalysisService
from backend.app.services.job_runner import JobRunner
from backend.app.services.live_service import LiveSessionService
from backend.app.storage.analysis_store import FilesystemAnalysisRepository
from backend.app.storage.temporary_files import TemporaryFileStore


@lru_cache
def get_service() -> AnalysisService:
    settings = get_settings()
    files = TemporaryFileStore(settings)
    repo = FilesystemAnalysisRepository(files)
    runner = JobRunner(max_workers=settings.worker_threads)
    return AnalysisService(settings, files, repo, runner)


@lru_cache
def get_live_service() -> LiveSessionService:
    return LiveSessionService(get_settings(), get_service())
