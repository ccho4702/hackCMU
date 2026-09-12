"""Persist repeatable voice trials against a run's fixed TTS reference."""
from datetime import datetime, timezone
import hashlib
import json
import math
import os
from pathlib import Path
import re
import threading
import time
import wave

from num2words import num2words

from backend.common.logging import log_event, save_json
from backend.common.media import run_media_command
from backend.elevenlabs_tts.alignment import validate_words
from backend.elevenlabs_tts.service import get_client

_COMPUTE_LOCK = threading.Lock()
_STATE_LOCK = threading.Lock()
_REFERENCE_LOCK = threading.Lock()
_MODEL_STATE = {"status": "not_started"}
METRICS = ("pronunciation_score", "rate_ratio", "rhythm_score", "intonation_score", "stress_match")


def _load_model():
    from backend.scoring.shadow_score import warmup
    import torch
    torch.set_num_threads(int(os.getenv("SCORING_CPU_THREADS", "4")))
    warmup()


def start_warmup():
    with _STATE_LOCK:
        if _MODEL_STATE["status"] != "not_started":
            return
        _MODEL_STATE["status"] = "loading"
    def load():
        try:
            with _COMPUTE_LOCK:
                _load_model()
            with _STATE_LOCK:
                _MODEL_STATE.update(status="ready")
        except Exception as exc:
            with _STATE_LOCK:
                _MODEL_STATE.update(status="failed", error_type=type(exc).__name__,
                                    message="The scoring model could not load. Check server logs and restart the server.")
            import logging
            logging.getLogger(__name__).exception("Scoring model initialization failed")
    threading.Thread(target=load, daemon=True, name="scoring-warmup").start()


def model_status():
    with _STATE_LOCK:
        return dict(_MODEL_STATE)


def scoring_text(text):
    """Expand English numbers for MMS_FA; don't silently drop unsupported letters."""
    if any(ch.isalpha() and not ("a" <= ch.lower() <= "z") for ch in text):
        raise ValueError("This practice scorer currently supports English scripts. Your original feedback and audio are still available.")
    def clock(match):
        hour, minute = map(int, match.groups())
        return num2words(hour) + (" o'clock" if minute == 0 else " " + ("oh " if minute < 10 else "") + num2words(minute))
    text = re.sub(r"\b(\d{1,2}):([0-5]\d)\b", clock, text)
    text = re.sub(r"\b(\d[\d,]*(?:\.\d+)?)%", lambda m: num2words(m[1].replace(",", "")) + " percent", text)
    text = re.sub(r"\$(\d[\d,]*(?:\.\d+)?)", lambda m: num2words(m[1].replace(",", "")) + " dollars", text)
    text = re.sub(r"\b\d[\d,]*(?:\.\d+)?\b", lambda m: num2words(m[0].replace(",", "")), text)
    text = text.replace("’", "'").replace("–", " ").replace("—", " ")
    text = re.sub(r"\s+", " ", text).strip()
    if len(re.findall(r"[A-Za-z]+", text)) < 2:
        raise ValueError("The practice script needs at least two spoken words.")
    return text


def to_wav(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    run_media_command(["-y", "-i", str(source), "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(target)])
    with wave.open(str(target), "rb") as audio:
        duration = audio.getnframes() / audio.getframerate()
    if not 0.1 <= duration <= 120:
        raise ValueError("Record between 0.1 and 120 seconds of audio.")
    return duration


def prepare_reference(run_dir):
    source = run_dir / "outputs/reference_speech.mp3"
    script_file = run_dir / "outputs/improved_script.txt"
    if not source.is_file() or not script_file.is_file():
        raise ValueError("Finish generating the improved script and TTS before starting a trial.")
    script = script_file.read_text(encoding="utf-8").strip()
    normalized = scoring_text(script)
    fingerprint = hashlib.sha256(source.read_bytes() + script.encode()).hexdigest()
    directory = run_dir / "intermediates/practice-reference"
    with _REFERENCE_LOCK:
        meta_path = directory / "reference.json"
        if meta_path.exists():
            import json
            stored = json.loads(meta_path.read_text())
            if stored.get("fingerprint") == fingerprint and (directory / "reference.wav").is_file():
                return stored
        duration = to_wav(source, directory / "reference.wav")
        result = {"script": script, "scoring_text": normalized, "fingerprint": fingerprint,
                  "duration_seconds": round(duration, 3), "max_trial_seconds": min(120, max(30, math.ceil(duration*2+15)))}
        save_json(meta_path, result)
    return result


_ALIGN_LOCK = threading.Lock()


def reference_timing(run_dir):
    path = run_dir / "outputs/reference_alignment.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    audio_hash = hashlib.sha256((run_dir / "outputs/reference_speech.mp3").read_bytes()).hexdigest()
    if data.get("audio_sha256") != audio_hash:
        return None
    validate_words(data["words"])
    return data


def align_existing_reference(run_dir, client=None):
    with _ALIGN_LOCK:
        existing = reference_timing(run_dir)
        if existing:
            return existing
        client = client or get_client()
        audio = run_dir / "outputs/reference_speech.mp3"
        script = (run_dir / "outputs/improved_script.txt").read_text()
        log_path = run_dir / "logs/reference-alignment.jsonl"
        log_event(log_path, "alignment_started", requests=1)
        try:
            with audio.open("rb") as stream:
                response = client.forced_alignment.create(file=stream, text=script,
                    request_options={"max_retries":0, "timeout_in_seconds":120})
            raw = response.model_dump(mode="json")
            words = [{"text":word["text"], "t0":word["start"], "t1":word["end"]} for word in raw["words"]]
            validate_words(words)
            result = {"source":"elevenlabs_forced_alignment", "text":" ".join(w["text"] for w in words),
                      "words":words, "audio_sha256":hashlib.sha256(audio.read_bytes()).hexdigest()}
            save_json(run_dir / "outputs/reference_alignment.json", result)
            log_event(log_path, "alignment_finished", status="success", word_count=len(words))
            return result
        except Exception as exc:
            log_event(log_path, "alignment_finished", status="failed", error_type=type(exc).__name__)
            # Existing recordings can use the same local alignment model as scoring
            # when the API key lacks the separately-scoped Forced Alignment feature.
            with _COMPUTE_LOCK:
                _load_model()
                from backend.scoring.shadow_score import align_words, encode, load_audio
                reference = prepare_reference(run_dir)
                words = align_words(encode(load_audio(run_dir / "intermediates/practice-reference/reference.wav")), reference["scoring_text"])
                valid = [word for word in words if word["t0"] is not None]
                confidences = [word["score"] for word in valid if word["score"] is not None]
                if not confidences or sum(confidences)/len(confidences) < .4:
                    raise ValueError("The reference could not be aligned reliably. Generate a new TTS reference with timestamps.") from exc
                result = {"source":"mms_forced_alignment", "text":reference["scoring_text"],
                          "words":validate_words([{"text":w["text"],"t0":w["t0"],"t1":w["t1"]} for w in valid]),
                          "audio_sha256":hashlib.sha256(audio.read_bytes()).hexdigest()}
                save_json(run_dir / "outputs/reference_alignment.json", result)
                log_event(log_path, "local_alignment_finished", status="success", word_count=len(valid))
                return result


def json_safe(value):
    if isinstance(value, dict): return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)): return [json_safe(v) for v in value]
    if isinstance(value, float) and not math.isfinite(value): return None
    return value


def evaluate_trial(run_dir, trial_dir, source, reference):
    import json
    started = time.monotonic()
    manifest_path = trial_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    def checkpoint(stage, **fields):
        manifest.update(stage=stage, elapsed_seconds=round(time.monotonic()-started, 2), **fields)
        save_json(manifest_path, manifest)
        log_event(trial_dir / "logs/events.jsonl", "stage_changed", stage=stage, status=manifest["status"])
    try:
        checkpoint("preparing_audio", status="running")
        user_wav = trial_dir / "intermediates/recording.wav"
        duration = to_wav(source, user_wav)
        if duration > reference["max_trial_seconds"] + 1:
            raise ValueError("The trial is too long. Read the displayed script once.")
        checkpoint("loading_model")
        with _COMPUTE_LOCK:
            _load_model()
            checkpoint("scoring")
            import numpy as np
            from backend.scoring.shadow_score import score_shadowing, load_audio
            user_audio = load_audio(user_wav)
            if len(user_audio) < 1600 or np.sqrt(np.mean(user_audio**2)) < 0.0001:
                result = {"status": "unreliable", "reason": "No clear speech was detected. Read the script aloud and try again."}
            else:
                try:
                    timing = reference_timing(run_dir)
                    tokens = [re.sub(r"[^a-z']", "", w.lower()) for w in reference["scoring_text"].split()]
                    timed_tokens = [re.sub(r"[^a-z']", "", w["text"].lower()) for w in timing["words"]] if timing else []
                    gt_words = timing["words"] if timing and tokens == timed_tokens else None
                    result = score_shadowing(run_dir / "intermediates/practice-reference/reference.wav", user_wav, reference["scoring_text"], gt_words=gt_words)
                except (ValueError, RuntimeError) as exc:
                    log_event(trial_dir / "logs/events.jsonl", "alignment_failed", error_type=type(exc).__name__)
                    result = {"status": "unreliable", "reason": "The recording could not be aligned to this script. Read every word and try again."}
            result = json_safe(result)
            gt_conf = result.get("align_confidence", {}).get("gt")
            if gt_conf is not None and gt_conf < 0.40:
                result.update(status="unreliable", reason="The reference audio could not be reliably aligned to the script.")
            save_json(trial_dir / "logs/raw-score.json", result)
            if result["status"] != "ok":
                result.update({key: None for key in METRICS})
                result["word_diff"] = []
                result["words"] = []
        save_json(trial_dir / "outputs/score.json", result)
        checkpoint("complete", status="complete", score=result, duration_seconds=round(duration, 3))
        from backend import history
        history.record_trial(run_dir.name, manifest, result)   # 리더보드용 기록 (Mongo 미설정이면 no-op)
    except Exception as exc:
        message = str(exc) if isinstance(exc, ValueError) else "Scoring could not finish. Please retry after the scoring engine is ready."
        checkpoint("failed", status="failed", error_message=message, error_type=type(exc).__name__)
