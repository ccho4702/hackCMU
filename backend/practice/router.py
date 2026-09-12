from datetime import datetime, timezone
import json
from pathlib import Path
import re
import threading
import uuid

from fastapi import APIRouter, BackgroundTasks, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.common.logging import save_json
from backend.pipeline.router import get_run
from backend.practice.service import evaluate_trial, prepare_reference, model_status, start_warmup, reference_timing, align_existing_reference

router = APIRouter(tags=["Voice practice"])
_CREATE_LOCK = threading.Lock()


def get_trial(run_id, trial_id):
    directory = get_run(run_id)
    if not re.fullmatch(r"[a-f0-9]{32}", trial_id):
        raise HTTPException(404, "Trial not found")
    trial = directory / "trials" / trial_id
    if not (trial / "manifest.json").exists():
        raise HTTPException(404, "Trial not found")
    return directory, trial


def serialize_trial(run_id, directory):
    result = json.loads((directory / "manifest.json").read_text())
    if (directory / "intermediates/recording.wav").exists() and result.get("stage") not in {"queued", "preparing_audio"}:
        result["audio_url"] = f"/api/runs/{run_id}/trials/{directory.name}/audio"
    return result


@router.get("/runs/{run_id}/practice")
def practice(run_id: str):
    run_dir = get_run(run_id)
    try:
        reference = prepare_reference(run_dir)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    start_warmup()
    trials = [serialize_trial(run_id, p.parent) for p in (run_dir / "trials").glob("*/manifest.json")]
    trials.sort(key=lambda x: (x["created_at"], x["trial_id"]), reverse=True)
    timing = reference_timing(run_dir)
    return {"run_id": run_id, **reference, "reference_audio_url": f"/api/runs/{run_id}/outputs/reference_speech.mp3",
            "model": model_status(), "trials": trials[:30], "trial_count": len(trials),
            "words": timing["words"] if timing else [], "alignment_source": timing["source"] if timing else None}


@router.post("/runs/{run_id}/practice/alignment")
def prepare_alignment(run_id: str):
    run_dir = get_run(run_id)
    try:
        prepare_reference(run_dir)
        return align_existing_reference(run_dir)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, "Could not prepare word timing. You can still record and score a trial without the guided highlight.") from exc


@router.post("/runs/{run_id}/trials", status_code=202)
def create_trial(run_id: str, file: UploadFile, background_tasks: BackgroundTasks):
    run_dir = get_run(run_id)
    try:
        reference = prepare_reference(run_dir)
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".webm", ".wav", ".mp3", ".m4a", ".mp4", ".ogg"}:
        raise HTTPException(415, "Upload an audio recording (WebM, WAV, MP3, M4A, MP4, or OGG).")
    with _CREATE_LOCK:
        trial_id = uuid.uuid4().hex
        directory = run_dir / "trials" / trial_id
        for name in ("inputs", "intermediates", "outputs", "logs"):
            (directory / name).mkdir(parents=True)
        number = len(list((run_dir / "trials").glob("*/manifest.json"))) + 1
        source = directory / "inputs" / f"recording{suffix}"
        size = 0
        with source.open("wb") as output:
            while chunk := file.file.read(1024*1024):
                size += len(chunk)
                if size > 25*1024*1024:
                    output.close(); source.unlink(missing_ok=True)
                    raise HTTPException(413, "The trial must be smaller than 25 MB.")
                output.write(chunk)
        if not size:
            source.unlink(missing_ok=True)
            raise HTTPException(400, "The trial recording is empty.")
        manifest = {"trial_id": trial_id, "trial_number": number, "run_id": run_id, "status": "queued", "stage": "queued",
                    "created_at": datetime.now(timezone.utc).isoformat(), "reference_fingerprint": reference["fingerprint"]}
        save_json(directory / "manifest.json", manifest)
    background_tasks.add_task(evaluate_trial, run_dir, directory, source, reference)
    return {**manifest, "status_url": f"/api/runs/{run_id}/trials/{trial_id}"}


@router.get("/runs/{run_id}/trials/{trial_id}")
def trial_status(run_id: str, trial_id: str):
    _, directory = get_trial(run_id, trial_id)
    return serialize_trial(run_id, directory)


@router.get("/runs/{run_id}/trials/{trial_id}/audio")
def trial_audio(run_id: str, trial_id: str):
    _, directory = get_trial(run_id, trial_id)
    path = directory / "intermediates/recording.wav"
    manifest = json.loads((directory / "manifest.json").read_text())
    if not path.exists() or manifest.get("stage") in {"queued", "preparing_audio"}:
        raise HTTPException(404, "Trial audio is not ready")
    return FileResponse(path, media_type="audio/wav")
