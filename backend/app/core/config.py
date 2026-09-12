from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    backend_version: str = "0.1.0"
    frontend_origin: str = "http://localhost:3000,http://127.0.0.1:3000"

    face_landmarker_path: Path = BACKEND_ROOT / "models" / "face_landmarker.task"
    face_landmarker_url: str = (
        "https://storage.googleapis.com/mediapipe-models/"
        "face_landmarker/face_landmarker/float16/1/face_landmarker.task"
    )
    model_asset_id: str = "face_landmarker_float16_v1"

    temp_storage_path: Path = Path("/tmp/mellonaires")
    max_upload_bytes: int = 500 * 1024 * 1024
    min_duration_ms: int = 800
    max_duration_ms: int = 20 * 60 * 1000
    max_width: int = 7680
    max_height: int = 4320
    max_live_duration_ms: int = 15 * 60 * 1000
    max_live_frame_bytes: int = 2 * 1024 * 1024

    # Explicit analyzer selection. Never silently fall back to mock.
    analyzer: str = "mediapipe"
    worker_threads: int = 1


@lru_cache
def get_settings() -> Settings:
    return Settings()
