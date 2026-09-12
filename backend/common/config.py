import os
import json
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


def service_account_info():
    raw = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "").strip()
    if not raw:
        return None
    try:
        info = json.loads(raw)
        if not isinstance(info, dict) or info.get("type") != "service_account":
            raise ValueError()
        if not all(isinstance(info.get(key), str) and info[key].strip()
                   for key in ("project_id", "client_email", "private_key", "token_uri")):
            raise ValueError()
        # Only accept Google's token destination, including when a teammate supplies the env file.
        if info["token_uri"] != "https://oauth2.googleapis.com/token":
            raise ValueError()
        project = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
        if project and info["project_id"] != project:
            raise ValueError()
        return info
    except (ValueError, TypeError):
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON must contain a valid Google service-account JSON for GOOGLE_CLOUD_PROJECT") from None


def google_project():
    info = service_account_info()
    if info:
        return info["project_id"]
    project = os.getenv("GOOGLE_CLOUD_PROJECT")
    if project:
        return project
    credentials, detected = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    project = detected or getattr(credentials, "quota_project_id", None)
    if not project:
        raise RuntimeError("Set GOOGLE_CLOUD_PROJECT and configure Application Default Credentials")
    return project
