"""
Mongo 연결. backend/.env 의 MONGODB_URI, MONGODB_DB(기본 hackcmu).

컬렉션
    users       {_id, name, email, created_at}
    references  {_id, user_id, question, voice_id, created_at, script[]}
                script[] = {id, text, words|null, audio(원본 상대경로), wav(16k 상대경로), duration_sec}
    trials      {_id, user_id, question, kind, reference_id, created_at, status, error,
                 media{raw, wav, duration_sec}, metrics{language, nonverbal}, shadowing[], summary}

파일 경로는 전부 DATA_DIR 기준 상대경로. /api/media/<상대경로> 로 서빙된다 (media.py).
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from functools import lru_cache

from bson import ObjectId
from backend.common.config import ROOT  # loads backend/.env consistently
from fastapi import HTTPException
from pymongo import ASCENDING, DESCENDING, MongoClient

def configured() -> bool:
    return bool(os.getenv("MONGODB_URI", "").strip())


@lru_cache(maxsize=1)
def client() -> MongoClient:
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise HTTPException(503, "MongoDB is not configured. Set MONGODB_URI in backend/.env.")
    return MongoClient(uri, serverSelectionTimeoutMS=3000, connectTimeoutMS=3000, timeoutMS=5000)


def db():
    return client()[os.environ.get("MONGODB_DB", "hackcmu")]


def users():
    return db()["users"]


def references():
    return db()["references"]


def trials():
    return db()["trials"]


def ensure_indexes() -> None:
    """서버 시작 시 한 번. 연결 확인도 겸한다."""
    client().admin.command("ping")
    users().create_index([("email", ASCENDING)], unique=True)
    references().create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    trials().create_index([("user_id", ASCENDING), ("created_at", DESCENDING)])
    trials().create_index([("user_id", ASCENDING), ("question", ASCENDING)])
    trials().create_index([("user_id", ASCENDING), ("reference_id", ASCENDING), ("created_at", DESCENDING)])


def now() -> datetime:
    return datetime.now(timezone.utc)


def public(doc):
    """Mongo 문서를 JSON 응답용으로. _id → id(str), datetime → ISO 문자열. 재귀."""
    if isinstance(doc, ObjectId):
        return str(doc)
    if isinstance(doc, datetime):
        return doc.isoformat()
    if doc is None:
        return None
    if isinstance(doc, list):
        return [public(x) for x in doc]
    if not isinstance(doc, dict):
        return doc
    out = {}
    for k, v in doc.items():
        if k == "_id":
            out["id"] = str(v)
        elif isinstance(v, ObjectId):
            out[k] = str(v)
        elif isinstance(v, datetime):
            out[k] = v.isoformat()
        elif isinstance(v, (dict, list)):
            out[k] = public(v)
        else:
            out[k] = v
    return out
