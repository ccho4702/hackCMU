"""ElevenLabs Scribe transcription, preserving the user's original speech."""
import os
from pathlib import Path
import time

from backend.common.language import Language, resolve_language, provider_language
from backend.common.logging import log_event, save_json
from backend.elevenlabs_tts.service import get_client


def transcribe_audio(audio_path, *, client=None, log_dir=None, language: Language | None = None):
    language = resolve_language(language)
    client = client or get_client()
    logs = Path(log_dir) if log_dir else Path(audio_path).parent / "asr-logs"
    logs.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    meta = {"model": os.getenv("ELEVENLABS_ASR_MODEL", "scribe_v2"), "asr_requests": 1,
            "status": "running", "requested_language": language}
    log_event(logs / "events.jsonl", "asr_started", **meta)
    try:
        with Path(audio_path).open("rb") as audio:
            response = client.speech_to_text.convert(
                file=audio, model_id=meta["model"], diarize=False,
                **({"language_code": provider_language(language)} if language else {}),
                tag_audio_events=False, timestamps_granularity="word", no_verbatim=False,
                request_options={"max_retries": 0, "timeout_in_seconds": 120},
            )
        payload = response.model_dump(mode="json")
        save_json(logs / "response.json", payload)
        text = payload.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("No speech was detected. Record a clearly audible presentation and try again.")
        meta.update(status="success", language_code=payload.get("language_code"), characters=len(text))
        return {"text": text.strip(), "language_code": payload.get("language_code"),
                "words": payload.get("words") or []}
    except Exception as exc:
        meta.update(status="failed", error_type=type(exc).__name__)
        raise
    finally:
        meta["elapsed_seconds"] = round(time.monotonic()-started, 2)
        save_json(logs / "meta.json", meta)
        log_event(logs / "events.jsonl", "asr_finished", **meta)
