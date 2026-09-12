"""
FastAPI backend.

Run:
    pip install -r backend/requirements.txt
    uvicorn backend.main:app --reload  # http://localhost:8000 (docs: /docs)

All routes live under /api so the Next.js rewrite (/api/* -> :8000/api/*)
maps paths 1:1.
"""

import os

from fastapi import APIRouter, FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from backend.common import config  # Load local environment before configuring services.
from backend.gemini_video.router import router as video_router
from backend.gemini_script.router import router as script_router
from backend.elevenlabs_tts.router import router as tts_router
from backend.pipeline.router import router as pipeline_router
from backend.elevenlabs_asr.router import router as asr_router
from backend.practice.router import router as practice_router

app = FastAPI(title="HackCMU Presentation Coach API")

# Only needed if the browser calls this server directly (e.g. frontend and
# backend deployed on different domains). Through the Next.js rewrite the
# browser sees a same-origin request, so CORS never kicks in.
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

api = APIRouter(prefix="/api")


@api.get("/health")
def health():
    return {"status": "ok"}


@api.get("/capabilities")
def capabilities():
    from starlette.routing import WebSocketRoute
    return {"landmarks": any(isinstance(route, WebSocketRoute) and route.path == "/api/ws/landmarks"
                              for route in app.routes), "recording_pipeline": True, "voice_practice": True}


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
app.include_router(api)
