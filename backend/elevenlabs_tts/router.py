from fastapi import APIRouter, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from backend.common.language import Language
from backend.common.media import save_upload
from backend.elevenlabs_tts.service import get_client, run_pipeline

router = APIRouter(prefix="/tts", tags=["ElevenLabs voice and speech"])


@router.post("/generate", response_class=FileResponse)
def generate(file: UploadFile, user_id: str = Form(min_length=1, max_length=128),
             improved_script: str = Form(min_length=1, max_length=10000),
             noisy_environment: bool = Form(False), language: Language | None = Form(None)):
    if not user_id.strip() or not improved_script.strip():
        raise HTTPException(422, "user_id and improved_script must contain text")
    try:
        client = get_client()
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    run_id, source = save_upload(file, {".mov", ".mp4", ".webm", ".mkv", ".mp3", ".wav", ".m4a", ".ogg"})
    run_dir = source.parent.parent
    try:
        audio = run_pipeline(user_id, str(source), improved_script, noisy_environment,
                             output_dir=run_dir / "outputs", intermediate_dir=run_dir / "intermediates",
                             log_dir=run_dir / "logs/elevenlabs", client=client, language=language)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    return FileResponse(audio, media_type="audio/mpeg", filename="reference_speech.mp3", headers={"X-Run-ID": run_id})
