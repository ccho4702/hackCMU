"""User-provided IVC + reference speech pipeline, isolated from Gemini services.

Generated speech is a practice reference; naturalness/pronunciation are not guaranteed.
"""
import base64
import hashlib
import logging
from backend.common.language import resolve_language
import os
from pathlib import Path
import uuid
import time

from elevenlabs.client import ElevenLabs
from elevenlabs.core.api_error import ApiError
import httpx

from backend.common.config import artifacts_dir
from backend.common.media import run_media_command
from backend.common.logging import log_event, save_json
from backend.elevenlabs_tts.alignment import character_to_words


def cleanup_created_voice(voice_id, *, client, stats=None, log_dir=None):
    """Delete only a voice owned by this invocation; never enumerate account voices.

    Cleanup cannot turn saved speech into a failed run or mask the original error.
    A failed deletion remains in the private run log for later recovery.
    """
    report = {"voice_id": voice_id, "status": "pending", "attempts": []}
    for attempt in range(1, 4):
        entry = {"attempt": attempt}
        retryable = False
        try:
            client.voices.delete(voice_id=voice_id, request_options={"max_retries": 0, "timeout_in_seconds": 3})
            entry["status"] = report["status"] = "deleted"
        except Exception as exc:
            code = exc.status_code if isinstance(exc, ApiError) else None
            entry.update(status="failed", error_type=type(exc).__name__, http_status=code)
            if code == 404:
                entry["status"] = report["status"] = "already_deleted"
            else:
                report["status"] = "failed"
                retryable = isinstance(exc, httpx.TransportError) or code in (408, 429) or (isinstance(code, int) and code >= 500)
        report["attempts"].append(entry)
        if report["status"] != "failed" or not retryable or attempt == 3:
            break
        time.sleep(0.25 * attempt)
    if stats is not None:
        stats.update(voice_cleanup_status=report["status"], voice_delete_requests=len(report["attempts"]))
    if log_dir is not None:
        try:
            save_json(Path(log_dir) / "voice_cleanup.json", report)
            log_event(Path(log_dir) / "events.jsonl", "voice_cleanup_finished", **report)
        except OSError:
            logging.getLogger(__name__).exception("Could not persist voice cleanup result")
    if report["status"] == "failed":
        logging.getLogger(__name__).warning("Voice cleanup failed; see private run log in %s", log_dir)
    return report


def get_client():
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured")
    return ElevenLabs(api_key=key)


def extract_audio(recording_path: str, out_path: str) -> str:
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    run_media_command(["-y", "-i", recording_path, "-vn", "-acodec", "libmp3lame", "-b:a", "192k", out_path])
    return out_path


def create_voice(user_id: str, audio_path: str, noisy_environment=False, *, client=None, stats=None, log_dir=None) -> str:
    """Create a fresh voice from this recording, including for returning users."""
    if not user_id.strip():
        raise ValueError("user_id is required")
    sample_path = Path(audio_path)
    if not sample_path.is_file() or not sample_path.stat().st_size:
        raise ValueError("A non-empty voice sample is required")
    client = client or get_client()
    user_hash = hashlib.sha256(user_id.encode()).hexdigest()[:12]
    if stats is not None:
        stats["clone_requests"] += 1
    with sample_path.open("rb") as sample:
        sample_hash = hashlib.file_digest(sample, "sha256").hexdigest()
        sample.seek(0)
        voice = client.voices.ivc.create(
            name=f"recording_{user_hash}_{uuid.uuid4().hex[:8]}", files=[sample],
            remove_background_noise=noisy_environment, labels={},
            request_options={"max_retries": 0})
    if not isinstance(voice.voice_id, str) or not voice.voice_id.strip():
        raise ValueError("ElevenLabs did not return a voice_id")
    try:
        requires_verification = bool(getattr(voice, "requires_verification", False))
        if log_dir is not None:
            # Private provenance only: never used to select a voice for a later run.
            save_json(Path(log_dir) / "voice.json", {
                "voice_id": voice.voice_id, "source": "current_recording",
                "sample_sha256": sample_hash, "sample_bytes": sample_path.stat().st_size,
                "requires_verification": requires_verification,
            })
        if requires_verification:
            raise RuntimeError("ElevenLabs requires verification for this recording's voice; TTS was not generated")
    except BaseException:
        # The caller has not received this ID yet, so creation owns cleanup here.
        cleanup_created_voice(voice.voice_id, client=client, stats=stats, log_dir=log_dir)
        raise
    return voice.voice_id


def generate_gt_speech(voice_id: str, script: str, out_path: str, *, client=None, language=None) -> str:
    language = resolve_language(language)
    if not script.strip():
        raise ValueError("script must contain text")
    model = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2")
    if model == "eleven_v3" and len(script) > 5000:
        raise ValueError("Eleven v3 supports up to 5,000 characters")
    client = client or get_client()
    destination = Path(out_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".part")
    # Multilingual v2 supports en/ko, but infers language from text; no language_code support.
    language_options = {"language_code": language} if language and model != "eleven_multilingual_v2" else {}
    try:
        response = client.text_to_speech.convert_with_timestamps(voice_id=voice_id, text=script,
            model_id=model, **language_options,
            output_format="mp3_44100_128",
            request_options={"max_retries": 0},
            voice_settings={"stability": 0.5} if model == "eleven_v3" else {"stability": 0.6, "similarity_boost": 0.8, "style": 0.2})
        payload = response.model_dump(mode="json")
        audio = base64.b64decode(payload["audio_base64"], validate=True)
        raw_alignment = payload.get("normalized_alignment") or payload.get("alignment") or {}
        alignment = character_to_words(raw_alignment)
        alignment.update(source="elevenlabs_tts", model=model, audio_sha256=hashlib.sha256(audio).hexdigest())
        partial.write_bytes(audio)
        if not partial.stat().st_size:
            raise ValueError("ElevenLabs returned empty audio")
        partial.replace(destination)
        save_json(destination.parent / "reference_alignment.json", alignment)
    finally:
        partial.unlink(missing_ok=True)
    return str(destination)


def run_pipeline(user_id: str, recording_path: str, improved_script: str,
                 noisy_environment: bool = False, *, output_dir=None, intermediate_dir=None,
                 log_dir=None, client=None, prepared_audio_path=None, language=None, on_stage=None) -> str:
    language = resolve_language(language)
    model = os.getenv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2")
    if not user_id.strip() or not improved_script.strip():
        raise ValueError("user_id and improved_script are required")
    source = Path(recording_path).resolve()
    if not source.is_file():
        raise ValueError("Recording does not exist")
    client = client or get_client()
    directory = Path(output_dir) if output_dir else artifacts_dir() / "elevenlabs" / uuid.uuid4().hex
    directory.mkdir(parents=True, exist_ok=True)
    intermediate = Path(intermediate_dir) if intermediate_dir else directory / "intermediates"
    logs = Path(log_dir) if log_dir else directory / "logs"
    intermediate.mkdir(parents=True, exist_ok=True)
    logs.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    stats = {"status": "running", "language": language, "model": model, "voice_source": "current_recording", "clone_requests": 0, "tts_requests": 0,
             "voice_cleanup_status": "not_created", "voice_delete_requests": 0}
    voice_id = None
    log_event(logs / "events.jsonl", "tts_stage_started")
    try:
        audio_path = str(prepared_audio_path) if prepared_audio_path else extract_audio(str(source), str(intermediate / "voice_sample.mp3"))
        if on_stage is not None:
            on_stage("voice_cloning")
        voice_id = create_voice(user_id, audio_path, noisy_environment, client=client, stats=stats, log_dir=logs)
        if on_stage is not None:
            on_stage("speech_generation")
        stats["tts_requests"] += 1
        result = generate_gt_speech(voice_id, improved_script, str(directory / "reference_speech.mp3"), client=client, language=language)
        stats["status"] = "success"
        return result
    except Exception as exc:
        stats.update(status="failed", error_type=type(exc).__name__)
        raise
    finally:
        if voice_id is not None:
            cleanup_created_voice(voice_id, client=client, stats=stats, log_dir=logs)
        stats["elapsed_seconds"] = round(time.monotonic()-started, 2)
        save_json(logs / "meta.json", stats)
        log_event(logs / "events.jsonl", "tts_stage_finished", **stats)
