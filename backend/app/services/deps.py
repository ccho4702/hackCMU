from functools import lru_cache

from app.core.config import get_settings
from app.services.analysis_service import AnalysisService
from app.services.job_runner import JobRunner
from app.services.live_service import LiveSessionService
from app.storage.analysis_store import FilesystemAnalysisRepository
from app.storage.temporary_files import TemporaryFileStore


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
