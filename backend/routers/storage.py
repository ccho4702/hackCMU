"""Database readiness and the gmin media API."""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from backend import db, media

router = APIRouter(tags=["Database storage"])


@router.get("/api/db/health")
def database_health():
    if not db.configured():
        return {"status": "disabled", "configured": False}
    db.client().admin.command("ping")
    return {"status": "ready", "configured": True}


@router.get("/api/media/{path:path}")
def media_file(path: str):
    file = media.abs_path(path)
    if file.suffix.lower() not in media.EXTENSIONS or not file.is_file():
        raise HTTPException(404, "Media not found")
    return FileResponse(file)
