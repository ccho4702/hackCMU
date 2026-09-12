"""Compatibility entry point; implementation lives in backend/gemini_video."""
from backend.gemini_video.service import main

if __name__ == "__main__":
    raise SystemExit(main())
