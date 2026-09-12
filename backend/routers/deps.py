"""공용 의존성. 가짜 로그인이라 X-User-Id 헤더가 곧 인증이다."""
from __future__ import annotations

from bson import ObjectId
from fastapi import Header, HTTPException

from backend import db


def parse_oid(s: str, what: str = "id") -> ObjectId:
    try:
        return ObjectId(s)
    except Exception:
        raise HTTPException(status_code=400, detail=f"{what} 형식이 잘못됐습니다: {s}")


def current_user_id(x_user_id: str = Header(..., alias="X-User-Id")) -> str:
    """POST /api/auth/login 이 돌려준 user_id 를 X-User-Id 헤더로 보낸다."""
    oid = parse_oid(x_user_id, "X-User-Id")
    if not db.users().find_one({"_id": oid}, {"_id": 1}):
        raise HTTPException(status_code=401, detail="존재하지 않는 사용자입니다. 다시 로그인하세요")
    return str(oid)
