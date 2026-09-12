import os
from pathlib import Path

import google.auth
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / "backend/.env")
load_dotenv(ROOT / ".env")


def artifacts_dir():
    path = Path(os.getenv("ARTIFACTS_DIR", str(ROOT / "backend/artifacts"))).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def google_project():
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if project:
        return project
    credentials, detected = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    project = detected or getattr(credentials, "quota_project_id", None)
    if not project:
        raise RuntimeError("Set GOOGLE_CLOUD_PROJECT and configure Application Default Credentials")
    return project
