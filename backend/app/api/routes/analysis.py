from __future__ import annotations

from typing import Annotated, AsyncIterator

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import Response, StreamingResponse

from backend.app.schemas.analysis import AnalysisResult, AnalysisResultLite, FrameAnalysis, WindowAnalysis
from backend.app.schemas.jobs import AnalysisAccepted, AnalysisProgress, TERMINAL_STATUSES
from backend.app.services.analysis_service import AnalysisService
from backend.app.services.deps import get_service

router = APIRouter()


@router.post("/analyses", response_model=AnalysisAccepted, status_code=202)
async def create_analysis(
    video: Annotated[UploadFile, File(description="Presentation video")],
    analysisConfig: Annotated[str | None, Form()] = None,
    thresholdConfig: Annotated[str | None, Form()] = None,
    service: AnalysisService = Depends(get_service),
):
    return service.create_from_upload(video, analysisConfig, thresholdConfig)


@router.get("/analyses/{analysis_id}", response_model=AnalysisProgress)
@router.get("/analyses/{analysis_id}/status", response_model=AnalysisProgress)
def get_status(analysis_id: str, service: AnalysisService = Depends(get_service)):
    return service.get_progress(analysis_id)


@router.get("/analyses/{analysis_id}/result", response_model=AnalysisResult)
def get_result(
    analysis_id: str,
    include_frames: bool = Query(default=True, alias="includeFrames"),
    service: AnalysisService = Depends(get_service),
):
    return service.get_result(analysis_id, include_frames=include_frames)


@router.get("/analyses/{analysis_id}/summary", response_model=AnalysisResultLite)
def get_summary(analysis_id: str, service: AnalysisService = Depends(get_service)):
    return service.get_result_lite(analysis_id)


@router.get("/analyses/{analysis_id}/windows", response_model=list[WindowAnalysis])
def get_windows(analysis_id: str, service: AnalysisService = Depends(get_service)):
    return service.get_windows(analysis_id)


@router.get("/analyses/{analysis_id}/frames", response_model=list[FrameAnalysis])
def get_frames(
    analysis_id: str,
    start_ms: int | None = Query(default=None, alias="startMs"),
    end_ms: int | None = Query(default=None, alias="endMs"),
    service: AnalysisService = Depends(get_service),
):
    return service.get_frames(analysis_id, start_ms, end_ms)


@router.get("/analyses/{analysis_id}/events")
async def stream_events(analysis_id: str, service: AnalysisService = Depends(get_service)):
    service.get_progress(analysis_id)

    async def events() -> AsyncIterator[str]:
        import asyncio
        import json

        last = None
        while True:
            progress = service.get_progress(analysis_id)
            payload = progress.model_dump(by_alias=True, mode="json")
            encoded = json.dumps(payload)
            if encoded != last:
                yield f"event: status\ndata: {encoded}\n\n"
                last = encoded
            if progress.status in TERMINAL_STATUSES:
                event_name = "complete" if progress.status.value == "completed" else "failed"
                yield f"event: {event_name}\ndata: {encoded}\n\n"
                break
            await asyncio.sleep(0.4)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/analyses/{analysis_id}/export/json")
def export_json(
    analysis_id: str,
    include_frames: bool = Query(default=True, alias="includeFrames"),
    service: AnalysisService = Depends(get_service),
):
    data = service.export_json(analysis_id, include_frames=include_frames)
    return Response(
        content=data,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{analysis_id}.json"',
        },
    )


@router.get("/analyses/{analysis_id}/export/csv")
def export_csv(analysis_id: str, service: AnalysisService = Depends(get_service)):
    data = service.export_csv(analysis_id)
    return Response(
        content=data,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{analysis_id}.csv"',
        },
    )


@router.delete("/analyses/{analysis_id}", status_code=204)
def delete_analysis(analysis_id: str, service: AnalysisService = Depends(get_service)):
    service.get_progress(analysis_id)
    service.delete(analysis_id)
    return Response(status_code=204)
