from fastapi import APIRouter, Depends

from backend.app.core.config import get_settings
from backend.app.schemas.export import HealthResponse
from backend.app.services.deps import get_service

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
def health(service=Depends(get_service)):
    settings = get_settings()
    if settings.analyzer.strip().lower() == "mock":
        model_ready = True
    else:
        model_ready = settings.face_landmarker_path.exists()
    return HealthResponse(
        status="ok",
        analyzer=service.analyzer.name,
        model_ready=model_ready,
        mock=service.analyzer.mock,
        backend_version=settings.backend_version,
    )
