"""Use a reference WAV with the documented Google Cloud voice replication API."""
import array
import base64
import json
import math
import os
from backend.common.config import google_project
from pathlib import Path
import re
import sys
import time
import wave

from backend.common.gemini import session as gemini_session, generate_endpoint


def main():
    root = Path(__file__).resolve().parents[2] / "outputs"
    reference = root / "voice-reference-full.wav"
    script = (root / "voice-replication-script-en.txt").read_text().strip()
    project = google_project()
    model = "gemini-2.5-flash-tts-eap-11-2025"
    with wave.open(str(reference), "rb") as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (1, 2, 24000)
        duration = wav.getnframes() / wav.getframerate()
        pcm = wav.readframes(wav.getnframes())
    samples = array.array("h", pcm)
    if sys.byteorder != "little":
        samples.byteswap()
    rms = math.sqrt(sum(x*x for x in samples) / len(samples))
    if not 10 <= duration <= 30 or rms < 1:
        raise ValueError("Reference must be non-silent and between 10 and 30 seconds")
    request = {
        "contents": {"role": "user", "parts": [{"text": "Read the following English script naturally and clearly: " + script}]},
        "generation_config": {
            "response_modalities": ["AUDIO"],
            "speech_config": {"voice_config": {"replicated_voice_config": {
                "voice_sample_audio": base64.b64encode(reference.read_bytes()).decode("ascii")
            }}},
        },
    }
    endpoint = generate_endpoint(project, model)
    print(f"Model: {model}\nReference duration: {duration:.2f}s\nScript: {script}", flush=True)
    started = time.monotonic()
    with gemini_session() as session:
        response = session.post(endpoint, json=request, headers={"x-goog-user-project": project}, timeout=120)
    payload = response.json()
    report = {
        "project": project, "model": model, "reference_file": str(reference),
        "reference_duration_seconds": round(duration, 3), "reference_rms": round(rms, 2),
        "script": script, "http_status": response.status_code,
        "elapsed_seconds": round(time.monotonic()-started, 2),
    }
    if not response.ok:
        report["error"] = payload.get("error", payload)
        (root / "voice-replication-result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1
    chunks = []
    mime = None
    for candidate in payload.get("candidates", []):
        for part in candidate.get("content", {}).get("parts", []):
            data = part.get("inlineData", {})
            if data.get("data"):
                mime = data.get("mimeType", "")
                chunks.append(base64.b64decode(data["data"], validate=True))
        if chunks:
            break
    pcm = b"".join(chunks)
    if not pcm or len(pcm) % 2 or not mime or not any(s in mime.lower() for s in ["pcm", "l16"]):
        raise ValueError(f"Unexpected or empty audio output: {mime}")
    match = re.search(r"rate=(\d+)", mime)
    rate = int(match.group(1)) if match else 24000
    audio_path = root / "voice-replication-en.wav"
    with wave.open(str(audio_path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    report.update({"file": str(audio_path), "mime_type": mime,
                   "duration_seconds": round(len(pcm)/2/rate, 3), "usage": payload.get("usageMetadata")})
    (root / "voice-replication-result.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
