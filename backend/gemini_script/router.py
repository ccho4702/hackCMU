from fastapi import APIRouter, HTTPException, UploadFile, Response, Form
from backend.common.language import Language
from backend.common.script_style import ScriptStyle
from backend.common.media import prepare_video, save_upload
from backend.common.logging import save_json

from backend.gemini_script.schemas import ScriptAnalysis, ScriptRequest
from backend.gemini_script.service import analyze_script

router = APIRouter(prefix="/script", tags=["Gemini script analysis"])


@router.post("/analyze", response_model=ScriptAnalysis)
def analyze(body: ScriptRequest):
    try:
        return analyze_script(body.script, language=body.language, script_style=body.script_style)
    except ValueError as exc:
        raise HTTPException(502, "Script analysis returned an invalid response") from exc


@router.post("/analyze-video", response_model=ScriptAnalysis)
def analyze_video(file: UploadFile, response: Response, language: Language | None = Form(None), script_style: ScriptStyle = Form("presentation")):
    run_id, source = save_upload(file, {".mov", ".mp4", ".webm", ".mkv"})
    run_dir = source.parent.parent
    response.headers["X-Run-ID"] = run_id
    video = prepare_video(source, run_dir / "intermediates/analysis-input.mp4")
    result = analyze_script(video_path=video, log_dir=run_dir / "logs/script", language=language, script_style=script_style)
    save_json(run_dir / "outputs/script_feedback.json", result.model_dump())
    (run_dir / "outputs/improved_script.txt").write_text(result.improved_script, encoding="utf-8")
    return result
