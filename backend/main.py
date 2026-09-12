"""
FastAPI backend.

Run:
    cd code/backend
    pip install -r requirements.txt
    fastapi dev main.py          # http://localhost:8000  (docs: /docs)

All routes live under /api so the Next.js rewrite (/api/* -> :8000/api/*)
maps paths 1:1.
"""

import os

from fastapi import APIRouter, FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="hack_cmu API")

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


app.include_router(api)
