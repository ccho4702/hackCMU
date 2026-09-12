"""
개선본(reference). 질문 하나에 대한 개선 스크립트와 문장별 TTS 오디오.
쉐도잉 trial 들이 이걸 기준으로 채점된다.

    POST /api/references            multipart
        question   str
        voice_id   str (선택)
        script     JSON 문자열  [{"id": "s0", "text": "...", "words": [{text,t0,t1}] | null}, ...]
        audio      파일 여러 개, script 순서대로 (ElevenLabs mp3 그대로)
    GET  /api/references?question=  내 reference 목록
    GET  /api/references/{id}

TTS 모듈(팀원)이 ElevenLabs 결과를 여기로 올리면 된다. words 는 with-timestamps 응답을 단어로 접은 것.
"""
from __future__ import annotations

import json
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from backend import db
from backend import media
from backend.routers.deps import current_user_id, parse_oid
from backend.elevenlabs_tts.alignment import validate_words

router = APIRouter(prefix="/api/references", tags=["references"])


def present(doc: dict) -> dict:
    p = db.public(doc)
    for s in p["script"]:
        s["audio_url"] = media.url(s.get("audio"))
    return p


@router.post("")
def create_reference(
    question: str = Form(...),
    script: str = Form(...),
    voice_id: Optional[str] = Form(None),
    audio: list[UploadFile] = File(...),
    user_id: str = Depends(current_user_id),
):
    try:
        items = json.loads(script)
        if not isinstance(items, list) or not 1 <= len(items) <= 100:
            raise ValueError("Expected 1 to 100 sentences")
        seen = set()
        for item in items:
            if not isinstance(item, dict) or not media.valid_stem(item.get("id")):
                raise ValueError("Invalid sentence ID")
            if item["id"] in seen or not isinstance(item.get("text"), str) or not item["text"].strip():
                raise ValueError("Sentence IDs must be unique and text must not be empty")
            seen.add(item["id"])
            if item.get("words") is not None:
                validate_words(item["words"])
    except Exception:
        raise HTTPException(status_code=400, detail='script must be a JSON array of [{"id","text"}]')
    if len(items) != len(audio):
        raise HTTPException(status_code=400, detail=f"script has {len(items)} sentences but {len(audio)} audio files; the counts must match")

    ref_id = ObjectId()
    rel_dir = f"{user_id}/references/{ref_id}"
    try:
        out = []
        for item, up in zip(items, audio):
            sid = str(item["id"])
            raw = media.save_upload(up, rel_dir, sid)
            wav = media.to_wav16k(raw, f"{rel_dir}/{sid}.16k.wav")
            out.append({
                "id": sid,
                "text": item["text"],
                "words": item.get("words"),
                "audio": raw,
                "wav": wav,
                "duration_sec": media.duration_sec(wav),
            })

        doc = {
            "_id": ref_id,
            "user_id": user_id,
            "question": question,
            "voice_id": voice_id,
            "created_at": db.now(),
            "script": out,
        }
        db.references().insert_one(doc)
    except Exception:
        media.remove_dir(rel_dir)
        raise
    return present(doc)


@router.get("")
def list_references(question: Optional[str] = None, user_id: str = Depends(current_user_id)):
    q = {"user_id": user_id}
    if question:
        q["question"] = question
    docs = db.references().find(q).sort("created_at", -1)
    return {"references": [present(d) for d in docs]}


@router.get("/{ref_id}")
def get_reference(ref_id: str, user_id: str = Depends(current_user_id)):
    doc = db.references().find_one({"_id": parse_oid(ref_id), "user_id": user_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Reference not found")
    return present(doc)
