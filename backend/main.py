"""Unified MediaPipe, Gemini, ElevenLabs, and voice-practice ASGI entry point."""
from backend.app.main import app, create_app

__all__ = ["app", "create_app"]
