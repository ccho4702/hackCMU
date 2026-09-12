"""
사용자별 이력 색인.

기존 파일 기반 흐름(artifacts/runs/{run_id}/…, trials/{trial_id}/…)은 그대로 두고,
"이 run 은 누구 것이고, 이 trial 의 점수는 얼마였나" 만 Mongo 에 적는다.
Mongo 가 설정돼 있지 않으면 전부 no-op 이라 기존 기능은 영향을 받지 않는다.

컬렉션
    runs             {_id: run_id, user_id, language, created_at}
    practice_trials  {_id: trial_id, run_id, user_id, trial_number, created_at, status, reason,
                      axes{pronunciation, rate, rhythm, intonation, stress}, overall, rate_ratio, word_diff[]}

overall 은 다섯 축의 가중치 없는 평균이다. 리더보드 정렬과 best 표시에만 쓰고
화면에는 다섯 축을 따로 보여준다 (backend/summary.py 와 같은 규칙).

훅 위치
    pipeline/router.py  pipeline()        → record_run
    practice/service.py evaluate_trial()  → record_trial
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from pymongo import ASCENDING, DESCENDING

from backend import db
from backend.summary import AXES, sentence_axes

log = logging.getLogger(__name__)


def runs():
    return db.db()["runs"]


def practice_trials():
    return db.db()["practice_trials"]


def ensure_indexes() -> None:
    runs().create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    practice_trials().create_index([("user_id", ASCENDING), ("run_id", ASCENDING), ("overall", DESCENDING)])


# -----------------------------------------------------------------------------
# 기록 (파이프라인·채점 쪽에서 호출. 절대 예외를 밖으로 내지 않는다)
# -----------------------------------------------------------------------------
def overall_of(score: dict) -> tuple[dict, Optional[float]]:
    """practice score.json → (축별 0~1, overall). unreliable 이면 전부 None."""
    if not score or score.get("status") != "ok":
        return {a: None for a in AXES}, None
    axes = sentence_axes(score)
    vals = [v for v in axes.values() if v is not None]
    return axes, (round(sum(vals) / len(vals), 3) if vals else None)


def record_run(run_id: str, user_id: str, language: Optional[str]) -> None:
    if not db.configured():
        return
    try:
        runs().update_one(
            {"_id": run_id},
            {"$setOnInsert": {"user_id": str(user_id), "language": language, "created_at": db.now()}},
            upsert=True,
        )
    except Exception:
        log.warning("history: could not record run %s", run_id, exc_info=True)


def record_trial(run_id: str, manifest: dict, score: dict) -> None:
    if not db.configured():
        return
    try:
        run = runs().find_one({"_id": run_id}, {"user_id": 1})
        if not run:
            return  # Mongo 도입 전에 만들어진 run. 주인을 모르니 건너뛴다
        axes, overall = overall_of(score)
        created = manifest.get("created_at")
        try:
            created_at = datetime.fromisoformat(created) if created else db.now()
        except ValueError:
            created_at = db.now()
        practice_trials().update_one(
            {"_id": manifest["trial_id"]},
            {"$set": {
                "run_id": run_id,
                "user_id": run["user_id"],
                "trial_number": manifest.get("trial_number"),
                "created_at": created_at,
                "status": (score or {}).get("status"),
                "reason": (score or {}).get("reason"),
                "axes": axes,
                "overall": overall,
                "rate_ratio": (score or {}).get("rate_ratio"),
                "word_diff": ((score or {}).get("word_diff") or [])[:3],
            }},
            upsert=True,
        )
    except Exception:
        log.warning("history: could not record trial %s", manifest.get("trial_id"), exc_info=True)


# -----------------------------------------------------------------------------
# 조회
# -----------------------------------------------------------------------------
def user_runs(user_id: str) -> list[dict]:
    return list(runs().find({"user_id": user_id}).sort("created_at", DESCENDING))


def run_owner(run_id: str) -> Optional[str]:
    doc = runs().find_one({"_id": run_id}, {"user_id": 1})
    return doc["user_id"] if doc else None


def trial_stats(user_id: str, run_id: str) -> dict:
    """run 하나의 {trial_count, scored_count, best_overall}."""
    docs = list(practice_trials().find({"user_id": user_id, "run_id": run_id}, {"overall": 1}))
    scored = [d["overall"] for d in docs if d.get("overall") is not None]
    return {"trial_count": len(docs), "scored_count": len(scored), "best_overall": max(scored) if scored else None}


def leaderboard(user_id: str, run_id: str) -> list[dict]:
    """overall 내림차순. 점수 없는(unreliable) trial 은 뒤로. rank 와 best 를 붙인다."""
    docs = list(practice_trials().find({"user_id": user_id, "run_id": run_id}))
    docs.sort(key=lambda d: (d.get("overall") is None, -(d.get("overall") or 0), -(d.get("trial_number") or 0)))
    out = []
    for i, d in enumerate(docs):
        p = db.public(d)
        p["trial_id"] = p.pop("id")
        p["rank"] = i + 1 if d.get("overall") is not None else None
        p["best"] = i == 0 and d.get("overall") is not None
        out.append(p)
    return out
