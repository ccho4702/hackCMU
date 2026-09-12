"""
FastAPI backend.

Run:
    cd backend
    pip install -r requirements.txt
    fastapi dev main.py          # http://localhost:8000  (docs: /docs)

All routes live under /api so the Next.js rewrite (/api/* -> :8000/api/*)
maps paths 1:1.

환경변수 (backend/.env)
    MONGODB_URI, MONGODB_DB   Atlas 연결. 시작 시 ping + 인덱스 생성
    DATA_DIR                  녹화·TTS 파일 저장 경로. /api/media/ 로 서빙
    SCORER_WARMUP=0           쉐도잉 채점 모델을 시작 시 안 올림 (torch 없는 환경, 프론트만 볼 때)
"""

import os
import sys
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

import db  # noqa: E402
import media  # noqa: E402
from routers import auth, references, trials  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.ensure_indexes()
    print(f"[startup] mongo ok: db={db.db().name}", file=sys.stderr)
    if os.getenv("SCORER_WARMUP", "1") != "0":
        try:
            from scoring.shadow_score import warmup
            print("[startup] loading shadowing scorer (첫 실행은 1.2GB 다운로드, 1분쯤)…", file=sys.stderr)
            warmup()
        except Exception as e:  # torch 없음 등. 서버는 뜨되 채점 요청만 실패한다
            print(f"[startup] scorer unavailable: {e}", file=sys.stderr)
    yield


app = FastAPI(title="hack_cmu API", lifespan=lifespan)

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
    # 초기 예제. 실제 녹화 업로드는 POST /api/trials 를 쓴다.
    data = await file.read()
    return {"filename": file.filename, "content_type": file.content_type, "size": len(data)}


app.include_router(api)
app.include_router(auth.router)
app.include_router(references.router)
app.include_router(trials.router)

media.DATA_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/api/media", StaticFiles(directory=str(media.DATA_DIR)), name="media")
