from backend.app.schemas.common import APIModel


class ExportQuery(APIModel):
    include_frames: bool = True


class HealthResponse(APIModel):
    status: str = "ok"
    analyzer: str
    model_ready: bool
    mock: bool = False
    backend_version: str
