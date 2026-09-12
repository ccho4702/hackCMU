"""One recording -> visual/vocal delivery feedback, revised script, reference speech."""
import json
import os
import time


from backend.common.language import Language, resolve_language
from backend.common.script_style import ScriptStyle, validate_script_style
from backend.common.config import google_project
from backend.common.gemini import session as gemini_session
from backend.common.logging import log_event, save_json
from backend.common.media import prepare_video
from backend.elevenlabs_tts.service import run_pipeline as synthesize
from backend.elevenlabs_tts.service import extract_audio
from backend.elevenlabs_asr.service import transcribe_audio
from backend.gemini_script.service import analyze_script
from backend.gemini_video.service import run_analysis, video_duration


def process_recording(source, user_id, noisy_environment=False, *, tts_client=None, language: Language | None = None, script_style: ScriptStyle = "presentation"):
    language = resolve_language(language)
    script_style = validate_script_style(script_style)
    run_dir = source.parent.parent
    manifest = {"run_id": run_dir.name, "language": language, "script_style": script_style, "status": "running", "stage": "prepare",
                "gemini_requests": {"video": 0, "script": 0}, "asr_requests": 0,
                "outputs": {}, "source_filename": source.name}
    started = time.monotonic()
    logs = run_dir / "logs"

    def checkpoint():
        manifest["elapsed_seconds"] = round(time.monotonic()-started, 2)
        save_json(run_dir / "manifest.json", manifest)
        log_event(logs / "pipeline.jsonl", "stage_changed", stage=manifest["stage"], status=manifest["status"])

    checkpoint()
    try:
        video = prepare_video(source, run_dir / "intermediates/analysis-input.mp4")
        audio_path = extract_audio(str(source), str(run_dir / "intermediates/voice_sample.mp3"))
        manifest["stage"] = "nonverbal_analysis"
        checkpoint()
        with gemini_session() as session:
            status = run_analysis(video, logs / "video", google_project(),
                                  os.getenv("GEMINI_VIDEO_MODEL", "gemini-3.8-flash"),
                                  video_duration(video), session,
                                  max_attempts=int(os.getenv("VIDEO_MAX_ATTEMPTS", "3")), language=language)
        video_meta = json.loads((logs / "video/presentation-analysis-meta.json").read_text())
        manifest["gemini_requests"]["video"] = video_meta["attempt_count"]
        if status:
            raise RuntimeError("Delivery analysis failed; see video attempt logs")
        delivery = json.loads((logs / "video/presentation-analysis.json").read_text())
        for key in ("nonverbal_feedback", "vocal_feedback"):
            save_json(run_dir / "outputs" / f"{key}.json", delivery[key])
            manifest["outputs"][key] = f"{key}.json"
        manifest["stage"] = "transcription"
        checkpoint()
        manifest["asr_requests"] = 1
        transcript = transcribe_audio(audio_path, client=tts_client, log_dir=logs / "asr", language=language)
        save_json(run_dir / "outputs/transcript.json", transcript)
        (run_dir / "intermediates/original_script.txt").write_text(transcript["text"], encoding="utf-8")
        manifest["outputs"]["transcript"] = "transcript.json"
        manifest["stage"] = "script_analysis"
        checkpoint()
        manifest["gemini_requests"]["script"] = 1
        script = analyze_script(script=transcript["text"], log_dir=logs / "script", language=language, script_style=script_style)
        save_json(run_dir / "outputs/script_feedback.json", script.model_dump())
        (run_dir / "outputs/improved_script.txt").write_text(script.improved_script, encoding="utf-8")
        manifest["outputs"]["script_feedback"] = "script_feedback.json"
        manifest["outputs"]["improved_script"] = "improved_script.txt"
        manifest["stage"] = "voice_cloning"
        checkpoint()
        def speech_stage(stage):
            if manifest["stage"] != stage:
                manifest["stage"] = stage
                checkpoint()

        synthesize(user_id, str(source), script.improved_script, noisy_environment,
                   output_dir=run_dir / "outputs", intermediate_dir=run_dir / "intermediates",
                   log_dir=logs / "elevenlabs", client=tts_client, prepared_audio_path=audio_path, language=language, on_stage=speech_stage)
        manifest["elevenlabs_requests"] = json.loads((logs / "elevenlabs/meta.json").read_text())
        manifest["outputs"]["tts_audio"] = "reference_speech.mp3"
        if (run_dir / "outputs/reference_alignment.json").exists():
            manifest["outputs"]["word_alignment"] = "reference_alignment.json"
        manifest.update(status="success", stage="complete")
        checkpoint()
        return manifest
    except Exception as exc:
        messages = {
            "prepare": "The recording could not be processed. Use a short video with both camera and microphone audio.",
            "nonverbal_analysis": "Video analysis failed. Check Google Cloud model access or try again later.",
            "transcription": "Speech transcription failed. Check your ElevenLabs key, credits, and speech-to-text access.",
            "script_analysis": "Script revision failed. Your original transcript is still available.",
            "voice_cloning": "Voice cloning failed. Check ElevenLabs cloning access and voice slots. Your feedback and revised script are saved.",
            "speech_generation": "Voice generation failed. Check ElevenLabs voice-cloning access and credits. Your feedback and revised script are saved.",
        }
        manifest.update(status="failed", error_type=type(exc).__name__,
                        error_message=messages.get(manifest["stage"], "Processing failed."))
        tts_log = logs / "elevenlabs/meta.json"
        if tts_log.exists():
            manifest["elevenlabs_requests"] = json.loads(tts_log.read_text())
        checkpoint()
        raise
