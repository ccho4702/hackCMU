import pytest


@pytest.mark.mediapipe
def test_mediapipe_importable():
    pytest.importorskip("mediapipe")
    from pathlib import Path

    from backend.app.core.config import get_settings

    settings = get_settings()
    if not Path(settings.face_landmarker_path).exists():
        pytest.skip("Face Landmarker model is not downloaded")
    from backend.app.mediapipe.face_landmarker import FaceLandmarkerSession

    session = FaceLandmarkerSession(Path(settings.face_landmarker_path))
    session.close()
