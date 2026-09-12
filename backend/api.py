import os
from fastapi import APIRouter, UploadFile, Request
from pydantic import BaseModel
from backend.common import config
from backend.gemini_video.router import router as video_router
from backend.gemini_script.router import router as script_router
from backend.elevenlabs_tts.router import router as tts_router
from backend.elevenlabs_asr.router import router as asr_router
from backend.pipeline.router import router as pipeline_router
from backend.practice.router import router as practice_router

api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    return {"status": "ok"}


@api.get("/capabilities")
def capabilities(request: Request):
    from starlette.routing import WebSocketRoute
    return {"landmarks": any(isinstance(route, WebSocketRoute) and route.path == "/api/ws/landmarks"
                              for route in request.app.routes), "live_analysis": any(route.path == "/api/v1/live/sessions" for route in request.app.routes), "recording_pipeline": True, "voice_practice": True}


class EchoRequest(BaseModel):
    message: str


@api.post("/echo")
def echo(body: EchoRequest):
    return {"echo": body.message}


@api.post("/upload")
async def upload(file: UploadFile):
    # Example for the photobooth recording upload — swap in the real pipeline.
    data = await file.read()
    return {"filename": file.filename, "content_type": file.content_type, "size": len(data)}


api.include_router(video_router)
api.include_router(script_router)
api.include_router(tts_router)
api.include_router(asr_router)
api.include_router(pipeline_router)
api.include_router(practice_router)
