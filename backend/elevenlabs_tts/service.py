"""User-provided IVC + reference speech pipeline, isolated from Gemini services.

Generated speech is a practice reference; naturalness/pronunciation are not guaranteed.
"""
import hashlib
import json
import os
from pathlib import Path
import threading
import uuid
import time

from elevenlabs.client import ElevenLabs

from backend.common.config import artifacts_dir
from backend.common.media import run_media_command
from backend.common.logging import log_event, save_json

_CACHE_LOCK = threading.RLock()


def get_client():
    key = os.getenv("ELEVENLABS_API_KEY")
    if not key:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured")
    return ElevenLabs(api_key=key)


def extract_audio(recording_path: str, out_path: str) -> str:
    Path(out_path).parent.mkdir(parents=True, exist_ok=True)
    run_media_command(["-y", "-i", recording_path, "-vn", "-acodec", "libmp3lame", "-b:a", "192k", out_path])
    return out_path


def _load_cache(path):
    if not path.exists():
        return {}
    cache = json.loads(path.read_text())
    if not isinstance(cache, dict) or not all(isinstance(k, str) and isinstance(v, str) and v for k, v in cache.items()):
        raise ValueError("Invalid voice cache; repair it before creating another paid voice clone")
    return cache


def _save_cache(path, cache):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(cache, indent=2), encoding="utf-8")
    temporary.replace(path)


def get_or_create_voice(user_id: str, audio_path: str, noisy_environment=False, *, client=None, cache_path=None, stats=None) -> str:
    client = client or get_client()
    path = Path(cache_path) if cache_path else artifacts_dir() / "elevenlabs/voice_cache.json"
    # Separate accounts without storing API keys; never put raw user IDs into paths.
    namespace = hashlib.sha256(os.getenv("ELEVENLABS_API_KEY", "injected-client").encode()).hexdigest()[:16]
    user_hash = hashlib.sha256(user_id.encode()).hexdigest()
    cache_key = f"{namespace}:{user_hash}"
    with _CACHE_LOCK:
        cache = _load_cache(path)
        if cache_key in cache:
            if stats is not None:
                stats["voice_cache_hit"] = True
            return cache[cache_key]
        if stats is not None:
            stats["clone_requests"] += 1
        with open(audio_path, "rb") as sample:
            voice = client.voices.ivc.create(name=f"clone_{user_hash[:12]}", files=[sample],
                remove_background_noise=noisy_environment, labels={}, request_options={"max_retries": 0})
        if not voice.voice_id:
            raise ValueError("ElevenLabs did not return a voice_id")
        cache[cache_key] = voice.voice_id
        _save_cache(path, cache)
        if getattr(voice, "requires_verification", False):
            raise RuntimeError("ElevenLabs requires voice verification; complete it in your ElevenLabs account. The created voice ID was cached to avoid cloning again")
        return voice.voice_id


def generate_gt_speech(voice_id: str, script: str, out_path: str, *, client=None) -> str:
    if not script.strip():
        raise ValueError("script must contain text")
    client = client or get_client()
    destination = Path(out_path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".part")
    try:
        audio = client.text_to_speech.convert(voice_id=voice_id, text=script,
            model_id=os.getenv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2"),
            output_format="mp3_44100_128",
            request_options={"max_retries": 0},
            voice_settings={"stability": 0.6, "similarity_boost": 0.8, "style": 0.2})
        with partial.open("wb") as stream:
            for chunk in audio:
                if chunk:
                    stream.write(chunk)
        if not partial.stat().st_size:
            raise ValueError("ElevenLabs returned empty audio")
        partial.replace(destination)
    finally:
        partial.unlink(missing_ok=True)
    return str(destination)


def run_pipeline(user_id: str, recording_path: str, improved_script: str,
                 noisy_environment: bool = False, *, output_dir=None, intermediate_dir=None,
                 log_dir=None, client=None, cache_path=None, prepared_audio_path=None) -> str:
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
    stats = {"status": "running", "voice_cache_hit": False, "clone_requests": 0, "tts_requests": 0}
    log_event(logs / "events.jsonl", "tts_stage_started")
    try:
        audio_path = str(prepared_audio_path) if prepared_audio_path else extract_audio(str(source), str(intermediate / "voice_sample.mp3"))
        voice_id = get_or_create_voice(user_id, audio_path, noisy_environment, client=client, cache_path=cache_path, stats=stats)
        stats["tts_requests"] += 1
        result = generate_gt_speech(voice_id, improved_script, str(directory / "reference_speech.mp3"), client=client)
        stats["status"] = "success"
        return result
    except Exception as exc:
        stats.update(status="failed", error_type=type(exc).__name__)
        raise
    finally:
        stats["elapsed_seconds"] = round(time.monotonic()-started, 2)
        save_json(logs / "meta.json", stats)
        log_event(logs / "events.jsonl", "tts_stage_finished", **stats)
