"""
trial = 녹화 한 번. 문서 하나.

    POST   /api/trials                            multipart. question, kind(original|shadow), reference_id, file(선택)
    GET    /api/trials?question=&kind=&reference_id=&limit=   내 trial 목록 + best 표시
    GET    /api/trials/{id}                       전체
    DELETE /api/trials/{id}
    POST   /api/trials/{id}/sentences/{sid}       문장 하나 쉐도잉 녹음 업로드 → 즉시 채점 → shadowing[] 갱신

두 가지 흐름을 다 받는다.
    (a) 전체 답변을 한 번에 녹음  → POST /api/trials 에 file. 백그라운드에서 wav 변환 후,
        reference 가 있으면 전체 녹음을 문장별로 잘라 채점한다.
    (b) 쉐도잉 카드에서 문장별 녹음 → POST /api/trials (file 없이) 로 trial 만들고,
        문장마다 /sentences/{sid} 에 올린다. 요청 안에서 채점하고(3~4초) 결과를 바로 돌려준다.

"가장 높은 trial" 은 summary.overall 기준이다 (summary.py). 오디오 점수만 본다.
리더보드는 reference_id 로 묶는다. GT 가 다르면 점수 기준이 달라서 한 보드에 섞으면 안 된다.
metrics.language / metrics.nonverbal 은 팀원 모듈(STT, MediaPipe)이 채우는 자리다. 여기서는 비워둔다.
"""
from __future__ import annotations

import traceback
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, Query

from backend import db
from backend import media
from backend.routers.deps import current_user_id, parse_oid
from backend.summary import compute_summary

router = APIRouter(prefix="/api/trials", tags=["trials"])

KINDS = ("original", "shadow")


# -----------------------------------------------------------------------------
# 표현
# -----------------------------------------------------------------------------
def present(doc: dict, brief: bool = False) -> dict:
    p = db.public(doc)
    m = p.get("media") or {}
    m["raw_url"], m["wav_url"] = media.url(m.get("raw")), media.url(m.get("wav"))
    if brief:
        p.pop("shadowing", None)
        p.pop("metrics", None)
    else:
        for s in p.get("shadowing") or []:
            s["wav_url"] = media.url(s.get("wav"))
    return p


def _owned_trial(trial_id: str, user_id: str) -> dict:
    doc = db.trials().find_one({"_id": parse_oid(trial_id), "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Trial not found")
    return doc


def _reference_for(reference_id: Optional[str], user_id: str) -> Optional[dict]:
    if not reference_id:
        return None
    ref = db.references().find_one({"_id": parse_oid(reference_id, "reference_id"), "user_id": user_id})
    if not ref:
        raise HTTPException(status_code=404, detail="Reference not found")
    return ref


# -----------------------------------------------------------------------------
# 채점
# -----------------------------------------------------------------------------
def _score_sentence(ref_sentence: dict, user_audio, note: dict) -> dict:
    """scoring.shadow_score 호출. import 를 여기서 하는 이유: torch 없는 환경에서도 서버는 뜨게."""
    from backend.scoring.shadow_score import score_shadowing
    r = score_shadowing(
        media.abs_path(ref_sentence["wav"]), user_audio, ref_sentence["text"],
        gt_words=ref_sentence.get("words"),
    )
    return {"sentence_id": ref_sentence["id"], "text": ref_sentence["text"], **note, **r}


def score_full_recording(wav_rel: str, ref: dict) -> list[dict]:
    """전체 녹음을 개선본 스크립트 전체에 정렬한 뒤 문장별로 잘라 채점한다."""
    from backend.scoring.shadow_score import SR, align_words, encode, load_audio

    y = load_audio(media.abs_path(wav_rel))
    full_text = " ".join(s["text"] for s in ref["script"])
    words = align_words(encode(y), full_text)

    out, i = [], 0
    for s in ref["script"]:
        n = len(s["text"].split())
        ws = [w for w in words[i:i + n] if w["t0"] is not None]
        i += n
        if not ws:
            out.append({"sentence_id": s["id"], "text": s["text"], "segment": None, "wav": None,
                        "status": "unreliable", "reason": "segment not found in recording"})
            continue
        t0 = max(ws[0]["t0"] - 0.15, 0.0)
        t1 = min(ws[-1]["t1"] + 0.15, len(y) / SR)
        seg = y[int(t0 * SR):int(t1 * SR)]
        out.append(_score_sentence(s, seg, {"segment": {"t0": round(t0, 3), "t1": round(t1, 3)}, "wav": None}))
    return out


def process_full_recording(trial_id: str) -> None:
    """BackgroundTasks. wav 변환 → (팀원 모듈 자리) → reference 있으면 쉐도잉 채점 → summary."""
    t = db.trials().find_one({"_id": ObjectId(trial_id)})
    if not t or not t["media"].get("raw"):
        return
    rel_dir = f"{t['user_id']}/trials/{trial_id}"
    try:
        wav = media.to_wav16k(t["media"]["raw"], f"{rel_dir}/audio.wav")
        upd = {"media.wav": wav, "media.duration_sec": media.duration_sec(wav)}
        db.trials().update_one({"_id": t["_id"]}, {"$set": upd})

        # ---- 팀원 모듈 자리 ------------------------------------------------
        # metrics.language  : STT(Gemini) → transcript, wpm, filler_per_min, ...
        # metrics.nonverbal : MediaPipe   → gaze_off_ratio, head_yaw_std, ...
        # 여기서 wav(오디오) / raw(영상) 경로를 넘겨 채우면 된다.
        # -------------------------------------------------------------------

        if t.get("reference_id"):
            ref = db.references().find_one({"_id": ObjectId(t["reference_id"])})
            if ref:
                shadowing = score_full_recording(wav, ref)
                db.trials().update_one({"_id": t["_id"]}, {"$set": {
                    "shadowing": shadowing, "summary": compute_summary(shadowing),
                }})
        db.trials().update_one({"_id": t["_id"]}, {"$set": {"status": "ready", "error": None}})
    except Exception as e:
        traceback.print_exc()
        db.trials().update_one({"_id": t["_id"]}, {"$set": {
            "status": "error", "error": {"code": "PIPELINE_FAILED", "message": "Recording processing failed. See server logs."},
        }})


# -----------------------------------------------------------------------------
# 엔드포인트
# -----------------------------------------------------------------------------
@router.post("")
def create_trial(
    background: BackgroundTasks,
    question: str = Form(...),
    kind: str = Form("original"),
    reference_id: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    user_id: str = Depends(current_user_id),
):
    if kind not in KINDS:
        raise HTTPException(status_code=400, detail=f"kind must be one of {KINDS}")
    ref = _reference_for(reference_id, user_id)
    if kind == "shadow" and not ref:
        raise HTTPException(status_code=400, detail="A shadow trial requires reference_id")

    tid = ObjectId()
    rel_dir = f"{user_id}/trials/{tid}"
    doc = {
        "_id": tid,
        "user_id": user_id,
        "question": question,
        "kind": kind,
        "reference_id": str(ref["_id"]) if ref else None,
        "created_at": db.now(),
        "status": "ready",
        "error": None,
        "media": {"raw": None, "wav": None, "duration_sec": None},
        "metrics": {"language": None, "nonverbal": None},
        "shadowing": [],
        "summary": None,
    }
    if file is not None:
        doc["media"]["raw"] = media.save_upload(file, rel_dir, "raw")
        doc["status"] = "processing"
    db.trials().insert_one(doc)
    if file is not None:
        background.add_task(process_full_recording, str(tid))
    return present(doc)


@router.get("")
def list_trials(
    question: Optional[str] = None,
    kind: Optional[str] = None,
    reference_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    user_id: str = Depends(current_user_id),
):
    """리더보드는 ?reference_id=&kind=shadow 로 조회한다. 같은 GT 기준 도전 기록만 모인다."""
    q = {"user_id": user_id}
    if question:
        q["question"] = question
    if kind:
        q["kind"] = kind
    if reference_id:
        q["reference_id"] = str(parse_oid(reference_id, "reference_id"))
    docs = list(db.trials().find(q, {"shadowing": 0, "metrics": 0}).sort("created_at", -1).limit(limit))

    scored = [d for d in docs if (d.get("summary") or {}).get("overall") is not None]
    # Scores from different GT references are not comparable.
    best_id = str(max(scored, key=lambda d: d["summary"]["overall"])["_id"]) if scored and reference_id else None

    items = []
    for d in docs:
        p = present(d, brief=True)
        p["best"] = p["id"] == best_id
        items.append(p)
    return {"trials": items, "best_trial_id": best_id}


@router.get("/{trial_id}")
def get_trial(trial_id: str, user_id: str = Depends(current_user_id)):
    return present(_owned_trial(trial_id, user_id))


@router.delete("/{trial_id}")
def delete_trial(trial_id: str, user_id: str = Depends(current_user_id)):
    t = _owned_trial(trial_id, user_id)
    db.trials().delete_one({"_id": t["_id"]})
    media.remove_dir(f"{user_id}/trials/{trial_id}")
    return {"deleted": trial_id}


@router.post("/{trial_id}/sentences/{sentence_id}")
def upload_sentence(
    trial_id: str,
    sentence_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(current_user_id),
):
    """쉐도잉 카드 흐름. 문장 하나 녹음을 올리면 그 자리에서 채점해 돌려준다."""
    t = _owned_trial(trial_id, user_id)
    if not t.get("reference_id"):
        raise HTTPException(status_code=400, detail="This trial has no reference")
    ref = _reference_for(t["reference_id"], user_id)
    s = next((x for x in ref["script"] if x["id"] == sentence_id), None)
    if not s:
        raise HTTPException(status_code=404, detail=f"Sentence {sentence_id} not found in reference")

    rel_dir = f"{user_id}/trials/{trial_id}/sentences"
    raw = media.save_upload(file, rel_dir, sentence_id)
    wav = media.to_wav16k(raw, f"{rel_dir}/{sentence_id}.16k.wav")

    try:
        entry = _score_sentence(s, media.abs_path(wav), {"segment": None, "wav": wav})
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail="Scoring failed. Check the server logs.")

    order = {x["id"]: i for i, x in enumerate(ref["script"])}
    shadowing = [x for x in t.get("shadowing", []) if x["sentence_id"] != sentence_id] + [entry]
    shadowing.sort(key=lambda x: order.get(x["sentence_id"], 10**6))
    summ = compute_summary(shadowing)
    db.trials().update_one({"_id": t["_id"]}, {"$set": {"shadowing": shadowing, "summary": summ, "status": "ready"}})

    e = db.public(entry)
    e["wav_url"] = media.url(wav)
    return {"sentence": e, "summary": summ}
