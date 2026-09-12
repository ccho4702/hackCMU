from fastapi import APIRouter, HTTPException, Response, UploadFile, Form

from backend.common.language import Language
from backend.common.logging import save_json
from backend.common.media import save_upload
from backend.elevenlabs_tts.service import extract_audio, get_client
from backend.elevenlabs_asr.service import transcribe_audio

router = APIRouter(prefix="/asr", tags=["ElevenLabs speech recognition"])


@router.post("/transcribe")
def transcribe(file: UploadFile, response: Response, language: Language | None = Form(None)):
    try:
        client = get_client()
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    run_id, source = save_upload(file, {".mov", ".mp4", ".webm", ".mkv", ".mp3", ".wav", ".m4a", ".ogg"})
    directory = source.parent.parent
    audio = extract_audio(str(source), str(directory / "intermediates/voice_sample.mp3"))
    result = transcribe_audio(audio, client=client, log_dir=directory / "logs/asr", language=language)
    save_json(directory / "outputs/transcript.json", result)
    response.headers["X-Run-ID"] = run_id
    return result
