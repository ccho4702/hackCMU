from __future__ import annotations

import time
from pathlib import Path

import cv2
import numpy as np
import pytest
from fastapi.testclient import TestClient


def _write_video(path: Path, seconds: float = 6.5, fps: float = 12.0) -> None:
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    size = (320, 240)
    writer = cv2.VideoWriter(str(path), fourcc, fps, size)
    frames = int(seconds * fps)
    for i in range(frames):
        frame = np.zeros((size[1], size[0], 3), dtype=np.uint8)
        cv2.rectangle(frame, (40, 40), (280, 200), (40, 80, 160), -1)
        writer.write(frame)
    writer.release()


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("ANALYZER", "mock")
    monkeypatch.setenv("TEMP_STORAGE_PATH", str(tmp_path / "store"))
    monkeypatch.setenv("FRONTEND_ORIGIN", "http://localhost:3000")
    from backend.app.core.config import get_settings
    from backend.app.services.deps import get_live_service, get_service

    get_settings.cache_clear()
    get_service.cache_clear()
    get_live_service.cache_clear()
    from backend.app.main import create_app

    app = create_app()
    with TestClient(app) as test_client:
        yield test_client
    get_settings.cache_clear()
    get_service.cache_clear()
    get_live_service.cache_clear()


def test_health(client: TestClient):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert body["analyzer"] == "mock"
    assert body["mock"] is True


def test_analysis_not_found(client: TestClient):
    res = client.get("/api/v1/analyses/anl_missing/status")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == "ANALYSIS_NOT_FOUND"


def test_invalid_upload_rejected(client: TestClient):
    res = client.post(
        "/api/v1/analyses",
        files={"video": ("notes.txt", b"not a video", "text/plain")},
    )
    assert res.status_code == 400
    assert res.json()["error"]["code"] in {"INVALID_VIDEO", "UNSUPPORTED_VIDEO_CODEC"}


def test_upload_progress_result_export(client: TestClient, tmp_path: Path):
    video_path = tmp_path / "talk.mp4"
    _write_video(video_path)
    with video_path.open("rb") as handle:
        res = client.post(
            "/api/v1/analyses",
            files={"video": ("talk.mp4", handle, "video/mp4")},
            data={"analysisConfig": '{"analysisFps": 10}'},
        )
    assert res.status_code == 202, res.text
    analysis_id = res.json()["analysisId"]
    assert analysis_id.startswith("anl_")

    status = None
    for _ in range(200):
        status = client.get(f"/api/v1/analyses/{analysis_id}/status").json()
        if status["status"] in {"completed", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    assert status is not None
    assert status["status"] == "completed", status
    assert 0 <= status["progress"] <= 1

    result = client.get(f"/api/v1/analyses/{analysis_id}/result").json()
    assert result["schemaVersion"]
    assert result["provenance"]["mock"] is True
    assert result["provenance"]["scoringVersion"]
    assert "windows" in result
    assert "alerts" in result
    missing = next(f for f in result["frames"] if not f["quality"]["faceDetected"])
    assert missing["landmarks"] is None

    csv_res = client.get(f"/api/v1/analyses/{analysis_id}/export/csv")
    assert csv_res.status_code == 200
    assert csv_res.text.splitlines()[0].startswith("startMs,endMs")

    lite = client.get(
        f"/api/v1/analyses/{analysis_id}/export/json",
        params={"includeFrames": "false"},
    )
    assert lite.status_code == 200
    assert lite.json()["frames"] == []

    deleted = client.delete(f"/api/v1/analyses/{analysis_id}")
    assert deleted.status_code == 204


def _jpeg_bytes() -> bytes:
    frame = np.zeros((48, 64, 3), dtype=np.uint8)
    ok, encoded = cv2.imencode(".jpg", frame)
    assert ok
    return encoded.tobytes()


def test_live_session_mock_tick_and_stop(client: TestClient):
    created = client.post("/api/v1/live/sessions")
    assert created.status_code == 201, created.text
    body = created.json()
    session_id = body["sessionId"]
    assert session_id == body["analysisId"]
    assert body["mock"] is True
    jpeg = _jpeg_bytes()
    last = None
    for i in range(24):
        timestamp = i * 80
        last = client.post(
            f"/api/v1/live/sessions/{session_id}/frames",
            files={"frame": ("frame.jpg", jpeg, "image/jpeg")},
            data={"timestampMs": str(timestamp)},
        )
        assert last.status_code == 200, last.text
    tick = last.json()
    assert tick["timestampMs"] >= 0
    assert "alerts" in tick
    assert "windows" in tick

    stopped = client.post(f"/api/v1/live/sessions/{session_id}/stop")
    assert stopped.status_code == 200, stopped.text
    analysis_id = stopped.json()["analysisId"]
    result = client.get(f"/api/v1/analyses/{analysis_id}/result").json()
    assert result["video"]["source"] == "live"
    assert result["alerts"] is not None
    assert result["provenance"]["scoringVersion"]
    assert len(result["windows"]) > 0
    assert len(result["frames"]) == 24

    again = client.post(f"/api/v1/live/sessions/{session_id}/stop")
    assert again.status_code == 404
