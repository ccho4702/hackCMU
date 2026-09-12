import json
import os
import shutil

from fastapi import APIRouter, HTTPException, Response, UploadFile

from backend.common.config import google_project
from backend.common.gemini import session as gemini_session
from backend.common.media import prepare_video, save_upload
from backend.gemini_video.schemas import VideoIssue
from backend.gemini_video.service import run_analysis, video_duration

router = APIRouter(prefix="/video", tags=["Gemini video analysis"])


@router.post("/analyze", response_model=list[VideoIssue])
def analyze_video(file: UploadFile, response: Response):
    run_id, source = save_upload(file, {".mov", ".mp4", ".webm", ".mkv"})
    run_dir = source.parent.parent
    response.headers["X-Run-ID"] = run_id
    try:
        video = prepare_video(source, run_dir / "intermediates/analysis-input.mp4")
        with gemini_session() as session:
            status = run_analysis(video, run_dir / "logs/video", google_project(),
                                  os.getenv("GEMINI_VIDEO_MODEL", "gemini-3.8-flash"),
                                  video_duration(video), session,
                                  max_attempts=int(os.getenv("VIDEO_MAX_ATTEMPTS", "3")))
        if status:
            raise HTTPException(502, {"message": "Video analysis failed; inspect the run logs", "run_id": run_id})
        result = run_dir / "outputs/nonverbal_feedback.json"
        shutil.copy2(run_dir / "logs/video/presentation-analysis.json", result)
        return json.loads(result.read_text())
    except ValueError as exc:
        raise HTTPException(422, {"message": str(exc), "run_id": run_id}) from exc
