"""Generate and validate a short Korean WAV with Google Cloud Gemini TTS."""
import array
import json
import math
import os
from backend.common.config import google_project
from pathlib import Path
import re
import sys
import time
import wave

from google import genai
from google.genai import types


def main():
    project = google_project()
    model = os.environ.get("GEMINI_TTS_MODEL", "gemini-2.5-flash-tts")
    sentence = "안녕하세요. 지금 제미나이로 한국어 음성을 만들고 있습니다. 음성 생성 테스트가 성공했습니다."
    output = Path(__file__).resolve().parents[2] / "outputs"
    output.mkdir(exist_ok=True)
    print(f"Project: {project}\nModel: {model}", flush=True)
    started = time.monotonic()
    with genai.Client(vertexai=True, project=project, location="global",
                      http_options=types.HttpOptions(api_version="v1beta1", timeout=120000)) as client:
        response = client.models.generate_content(
            model=model,
            contents=f"자연스럽고 명확한 한국어로 다음 문장만 읽어주세요: {sentence}",
            config=types.GenerateContentConfig(
                response_modalities=["AUDIO"],
                speech_config=types.SpeechConfig(
                    language_code="ko-KR",
                    voice_config=types.VoiceConfig(
                        prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name="Kore")),
                ),
            ),
        )
    chunks = []
    mime = None
    for candidate in response.candidates or []:
        if candidate.content:
            for part in candidate.content.parts or []:
                if part.inline_data and part.inline_data.data:
                    current_mime = part.inline_data.mime_type
                    if mime is not None and mime != current_mime:
                        raise ValueError("Mixed audio formats")
                    mime = current_mime
                    chunks.append(part.inline_data.data)
        if chunks:
            break
    pcm = b"".join(chunks)
    if not pcm or not mime or "audio/" not in mime:
        raise ValueError("No audio returned")
    if not ("pcm" in mime.lower() or "l16" in mime.lower()):
        raise ValueError(f"Unexpected audio encoding: {mime}")
    if len(pcm) % 2:
        raise ValueError("Invalid 16-bit PCM byte count")
    rate_match = re.search(r"rate=(\d+)", mime)
    rate = int(rate_match.group(1)) if rate_match else 24000
    audio_path = output / "tts-test-ko.wav"
    with wave.open(str(audio_path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm)
    samples = array.array("h", pcm)
    if sys.byteorder != "little":
        samples.byteswap()
    rms = math.sqrt(sum(s*s for s in samples) / len(samples))
    if rms < 1:
        raise ValueError("Generated audio is silent")
    with wave.open(str(audio_path), "rb") as wav:
        duration = wav.getnframes() / wav.getframerate()
    result = {
        "project": project, "model": model, "voice": "Kore", "text": sentence,
        "mime_type": mime, "sample_rate": rate, "duration_seconds": round(duration, 3),
        "elapsed_seconds": round(time.monotonic()-started, 2),
        "pcm_bytes": len(pcm), "rms": round(rms, 2), "file": str(audio_path),
        "usage": response.usage_metadata.model_dump(mode="json") if response.usage_metadata else None,
    }
    (output / "tts-test-ko.json").write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("PASS: TTS returned non-silent audio and a valid WAV was saved")


if __name__ == "__main__":
    main()
