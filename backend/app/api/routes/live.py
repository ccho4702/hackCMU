from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, UploadFile

from app.schemas.analysis import LiveSessionAccepted, LiveSessionStopResult, LiveTick
from app.services.deps import get_live_service
from app.services.live_service import LiveSessionService

router = APIRouter()


@router.post("/live/sessions", response_model=LiveSessionAccepted, status_code=201)
def create_live_session(service: LiveSessionService = Depends(get_live_service)):
    return service.create()


@router.post("/live/sessions/{session_id}/frames", response_model=LiveTick)
def ingest_live_frame(
    session_id: str,
    frame: Annotated[UploadFile, File(description="JPEG camera frame")],
    timestampMs: Annotated[int, Form()],
    service: LiveSessionService = Depends(get_live_service),
):
    return service.ingest_frame(session_id, frame, timestampMs)


@router.post("/live/sessions/{session_id}/stop", response_model=LiveSessionStopResult)
def stop_live_session(
    session_id: str,
    service: LiveSessionService = Depends(get_live_service),
):
    return service.stop(session_id)
