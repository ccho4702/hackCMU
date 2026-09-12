"""
가짜 로그인. 이름과 이메일만 받고 user_id 를 돌려준다. 비밀번호 없음.
이후 요청은 X-User-Id 헤더로 사용자를 식별한다.

    POST /api/auth/login  {name, email}  ->  {user_id, name, email}
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pymongo import ReturnDocument

from backend import db

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginBody(BaseModel):
    name: str
    email: str


@router.post("/login")
def login(body: LoginBody):
    email = body.email.strip().lower()
    name = body.name.strip()
    if "@" not in email or not name:
        raise HTTPException(status_code=400, detail="이름과 이메일이 필요합니다")
    doc = db.users().find_one_and_update(
        {"email": email},
        {"$set": {"name": name}, "$setOnInsert": {"created_at": db.now()}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return {"user_id": str(doc["_id"]), "name": doc["name"], "email": doc["email"]}
