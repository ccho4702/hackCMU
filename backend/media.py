"""
파일 저장과 ffmpeg 변환.

경로는 DATA_DIR(.env, 기본 ./data) 기준 상대경로로 Mongo에 저장하고,
main.py 가 /api/media/<상대경로> 로 정적 서빙한다.

폴더 구조
    data/{user_id}/references/{ref_id}/{sentence_id}.mp3      원본 TTS
    data/{user_id}/references/{ref_id}/{sentence_id}.16k.wav  채점용
    data/{user_id}/trials/{trial_id}/raw.webm                 원본 녹화
    data/{user_id}/trials/{trial_id}/audio.wav                채점용 16k mono
    data/{user_id}/trials/{trial_id}/sentences/{sid}.*        문장별 쉐도잉 녹음
"""
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(os.environ.get("DATA_DIR", "./data")).resolve()


def ensure_dir(rel_dir: str) -> Path:
    p = DATA_DIR / rel_dir
    p.mkdir(parents=True, exist_ok=True)
    return p


def abs_path(rel: str) -> Path:
    return DATA_DIR / rel


def url(rel: Optional[str]) -> Optional[str]:
    return f"/api/media/{rel}" if rel else None


def save_upload(upload, rel_dir: str, stem: str) -> str:
    """FastAPI UploadFile 을 저장하고 상대경로를 돌려준다. 확장자는 원본 파일명에서 가져온다."""
    d = ensure_dir(rel_dir)
    ext = Path(upload.filename or "").suffix.lower() or ".bin"
    dst = d / f"{stem}{ext}"
    with dst.open("wb") as f:
        shutil.copyfileobj(upload.file, f)
    return str(dst.relative_to(DATA_DIR))


def to_wav16k(rel_src: str, rel_dst: str) -> str:
    """ffmpeg 로 16 kHz mono wav 변환. 채점 모듈 입력 규격."""
    src, dst = DATA_DIR / rel_src, DATA_DIR / rel_dst
    dst.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["ffmpeg", "-loglevel", "error", "-y", "-i", str(src), "-ar", "16000", "-ac", "1", str(dst)],
        check=True,
    )
    return str(dst.relative_to(DATA_DIR))


def duration_sec(rel: str) -> float:
    import soundfile as sf
    return round(float(sf.info(str(DATA_DIR / rel)).duration), 3)


def remove_dir(rel_dir: str) -> None:
    shutil.rmtree(DATA_DIR / rel_dir, ignore_errors=True)
