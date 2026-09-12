"""
로그인한 사용자의 이력. 모든 엔드포인트가 X-User-Id 헤더를 요구한다.

    GET /api/me                        사용자 정보 + run/trial 개수
    GET /api/me/runs                   내 영상(run) 목록. 최신순. 상태·개선 스크립트 첫 줄·trial 통계·이동 링크
    GET /api/runs/{run_id}/leaderboard 그 영상에 대한 내 트라이얼 순위. overall 기준, best 표시

run 파일이 지워졌어도 Mongo 기록은 남으므로 status 가 "missing" 으로 올 수 있다.
"""
from __future__ import annotations

import json
import re

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from backend import db, history
from backend.common.config import artifacts_dir
from backend.routers.deps import current_user_id

router = APIRouter(prefix="/api", tags=["history"])

RUN_ID = re.compile(r"[0-9a-f]{32}")


def _manifest(run_id: str) -> dict:
    path = artifacts_dir() / "runs" / run_id / "manifest.json"
    if not path.is_file():
        return {"status": "missing", "stage": None}
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return {"status": "missing", "stage": None}


def _title(run_id: str) -> str | None:
    """개선 스크립트 첫 문장. 목록에서 '어떤 발표였는지' 알아보게."""
    path = artifacts_dir() / "runs" / run_id / "outputs" / "improved_script.txt"
    if not path.is_file():
        return None
    text = " ".join(path.read_text(errors="ignore").split())
    return (text[:110] + "…") if len(text) > 110 else (text or None)


@router.get("/me")
def me(user_id: str = Depends(current_user_id)):
    user = db.users().find_one({"_id": ObjectId(user_id)})
    if user.get("is_guest"):
        user = {**user, "email": None}
    return {
        **db.public(user),
        "user_id": user_id,
        "run_count": history.runs().count_documents({"user_id": user_id}),
        "trial_count": history.practice_trials().count_documents({"user_id": user_id}),
    }


@router.get("/me/runs")
def my_runs(user_id: str = Depends(current_user_id)):
    items = []
    for run in history.user_runs(user_id):
        run_id = run["_id"]
        m = _manifest(run_id)
        run_dir = artifacts_dir() / "runs" / run_id
        items.append({
            "run_id": run_id,
            "created_at": run.get("created_at"),
            "language": run.get("language"),
            "status": m.get("status"),
            "stage": m.get("stage"),
            "error_message": m.get("error_message"),
            "title": _title(run_id),
            "has_reference": (run_dir / "outputs" / "reference_speech.mp3").is_file(),
            "original_video_url": f"/api/runs/{run_id}/original",
            "urls": {"evaluation": f"/evaluation?run={run_id}", "practice": f"/practice?run={run_id}"},
            **history.trial_stats(user_id, run_id),
        })
    return {"runs": db.public(items), "count": len(items)}


@router.get("/runs/{run_id}/leaderboard")
def run_leaderboard(run_id: str, user_id: str = Depends(current_user_id)):
    if not RUN_ID.fullmatch(run_id):
        raise HTTPException(404, "Run not found")
    owner = history.run_owner(run_id)
    if owner is None or owner != user_id:
        raise HTTPException(404, "Run not found")
    trials = history.leaderboard(user_id, run_id)
    for t in trials:
        t["audio_url"] = f"/api/runs/{run_id}/trials/{t['trial_id']}/audio"
    return {
        "run_id": run_id,
        "trials": trials,
        "best_trial_id": next((t["trial_id"] for t in trials if t["best"]), None),
        "trial_count": len(trials),
    }
