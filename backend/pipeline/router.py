import json
import re

from fastapi import APIRouter, BackgroundTasks, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.common.language import Language, resolve_language
from backend.common.config import artifacts_dir
from backend.common.media import save_upload
from backend.elevenlabs_tts.service import get_client
from backend.pipeline.service import process_recording
from backend.common.logging import save_json

router = APIRouter(tags=["Presentation pipeline"])
OUTPUT_FILES = {"reference_alignment.json", "nonverbal_feedback.json", "vocal_feedback.json", "script_feedback.json", "transcript.json", "improved_script.txt", "reference_speech.mp3"}


def get_run(run_id):
    if not re.fullmatch(r"[0-9a-f]{32}", run_id):
        raise HTTPException(404, "Run not found")
    directory = artifacts_dir() / "runs" / run_id
    if not directory.is_dir():
        raise HTTPException(404, "Run not found")
    return directory


def public_manifest(manifest):
    run_id = manifest["run_id"]
    directory = get_run(run_id)
    result = {**manifest, "outputs": {
        key: f"/api/runs/{run_id}/outputs/{name}" for key, name in manifest.get("outputs", {}).items()
        if name in OUTPUT_FILES
    }, "original_video_url": f"/api/runs/{run_id}/original"}
    result["results"] = {}
    for key in ("nonverbal_feedback", "vocal_feedback", "script_feedback", "transcript"):
        name = manifest.get("outputs", {}).get(key)
        if name in OUTPUT_FILES and (directory / "outputs" / name).is_file():
            result["results"][key] = json.loads((directory / "outputs" / name).read_text())
    return result


def process_in_background(source, user_id, noisy_environment, client, language=None):
    try:
        process_recording(source, user_id, noisy_environment, tts_client=client, language=language)
    except Exception:
        # process_recording persists the failed stage and partial outputs.
        # Do not re-raise after the 202 response has already been sent.
        pass


@router.post("/pipeline", status_code=202)
def pipeline(file: UploadFile, background_tasks: BackgroundTasks,
             user_id: str = Form(min_length=1, max_length=128),
             noisy_environment: bool = Form(False), language: Language | None = Form(None)):
    language = resolve_language(language)
    if not user_id.strip():
        raise HTTPException(422, "user_id must contain text")
    # Fail before paid Gemini calls if the required TTS configuration is missing.
    try:
        client = get_client()
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    run_id, source = save_upload(file, {".mov", ".mp4", ".webm", ".mkv"})
    manifest = {"run_id": run_id, "language": language, "status": "queued", "stage": "queued", "outputs": {},
                "source_filename": source.name}
    save_json(source.parent.parent / "manifest.json", manifest)
    background_tasks.add_task(process_in_background, source, user_id, noisy_environment, client, language)
    return {**public_manifest(manifest), "status_url": f"/api/runs/{run_id}"}


@router.get("/runs/{run_id}")
def run_status(run_id: str):
    path = get_run(run_id) / "manifest.json"
    if not path.exists():
        raise HTTPException(404, "Pipeline manifest not found")
    return public_manifest(json.loads(path.read_text()))


@router.get("/runs/{run_id}/original")
def original_video(run_id: str):
    directory = get_run(run_id)
    preview = directory / "intermediates/analysis-input.mp4"
    manifest_path = directory / "manifest.json"
    if preview.is_file() and manifest_path.exists():
        manifest = json.loads(manifest_path.read_text())
        if manifest.get("stage") not in {"queued", "prepare"}:
            return FileResponse(preview, media_type="video/mp4")
    source = next((p for p in (directory / "inputs").glob("recording.*")
                   if p.suffix in {".mov", ".mp4", ".webm", ".mkv"}), None)
    if not source:
        raise HTTPException(404, "Original video not found")
    mime = {".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska"}.get(source.suffix, "video/mp4")
    return FileResponse(source, media_type=mime)


@router.get("/runs/{run_id}/outputs/{filename}")
def download_output(run_id: str, filename: str):
    if filename not in OUTPUT_FILES:
        raise HTTPException(404, "Output not found")
    path = get_run(run_id) / "outputs" / filename
    if not path.is_file():
        raise HTTPException(404, "Output not found")
    media_type = "audio/mpeg" if filename.endswith(".mp3") else "application/json" if filename.endswith(".json") else "text/plain"
    return FileResponse(path, media_type=media_type, filename=filename)
