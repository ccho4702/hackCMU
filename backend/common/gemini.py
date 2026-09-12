"""Gemini authentication on Google Cloud only (never the AI Studio endpoint)."""
import os
from contextlib import contextmanager

import google.auth
from google.oauth2 import service_account
from google.auth.transport.requests import AuthorizedSession
from google import genai
from google.genai import types
import requests

from backend.common.config import google_project, service_account_info


def auth_mode():
    mode = os.getenv("GEMINI_AUTH_MODE", "adc").strip().lower()
    if mode not in {"adc", "vertex_api_key"}:
        raise ValueError("GEMINI_AUTH_MODE must be adc or vertex_api_key")
    return mode


def vertex_key():
    key = os.getenv("VERTEX_API_KEY", "").strip()
    if not key:
        raise RuntimeError("Set VERTEX_API_KEY to a Google Cloud Vertex API key, not an AI Studio key")
    return key


def credentials():
    info = service_account_info()
    if info:
        try:
            return service_account.Credentials.from_service_account_info(info,
                scopes=["https://www.googleapis.com/auth/cloud-platform"])
        except (ValueError, TypeError):
            raise RuntimeError("Could not load GOOGLE_SERVICE_ACCOUNT_JSON credentials") from None
    # GOOGLE_APPLICATION_CREDENTIALS also supports a portable service-account JSON file.
    value, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return value


def client(timeout_ms=90000, api_version="v1"):
    options = types.HttpOptions(api_version=api_version, timeout=timeout_ms,
        retry_options=types.HttpRetryOptions(attempts=1))
    if auth_mode() == "vertex_api_key":
        return genai.Client(vertexai=True, api_key=vertex_key(), http_options=options)
    return genai.Client(vertexai=True, project=google_project(),
        location=os.getenv("GOOGLE_CLOUD_LOCATION", "global"),
        credentials=credentials(), http_options=options)


@contextmanager
def session():
    if auth_mode() == "vertex_api_key":
        with requests.Session() as value:
            # Keep secrets out of URLs and URL-bearing exception logs.
            value.headers["x-goog-api-key"] = vertex_key()
            yield value
    else:
        with AuthorizedSession(credentials()) as value:
            yield value


def generate_endpoint(project, model):
    base = "https://aiplatform.googleapis.com/v1/"
    if auth_mode() == "adc":
        base += f"projects/{project}/locations/global/"
    return base + f"publishers/google/models/{model}:generateContent"
