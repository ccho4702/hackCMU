from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from app.api.errors import AppError
from app.schemas.analysis import Landmark3D
from app.schemas.errors import ErrorCode

logger = logging.getLogger(__name__)


@dataclass
class LandmarkerObservation:
    landmarks: list[Landmark3D] | None
    blendshapes: dict[str, float] | None
    facial_transformation_matrix: list[float] | None


class FaceLandmarkerSession:
    """Reusable Face Landmarker wrapper. One instance per analysis, not per frame."""

    def __init__(self, model_path: Path):
        try:
            import mediapipe as mp
            from mediapipe.tasks import python as mp_python
            from mediapipe.tasks.python import vision
        except Exception as exc:  # pragma: no cover - import environment
            raise AppError(
                ErrorCode.MODEL_INITIALIZATION_FAILED,
                "MediaPipe could not be imported.",
                status_code=500,
                details={"reason": str(exc)},
            ) from exc

        self._mp = mp
        try:
            options = vision.FaceLandmarkerOptions(
                base_options=mp_python.BaseOptions(model_asset_path=str(model_path)),
                running_mode=vision.RunningMode.VIDEO,
                num_faces=1,
                min_face_detection_confidence=0.5,
                min_face_presence_confidence=0.5,
                min_tracking_confidence=0.5,
                output_face_blendshapes=True,
                output_facial_transformation_matrixes=True,
            )
            self._landmarker = vision.FaceLandmarker.create_from_options(options)
        except Exception as exc:
            raise AppError(
                ErrorCode.MODEL_INITIALIZATION_FAILED,
                "MediaPipe Face Landmarker failed to initialize.",
                status_code=500,
                details={"reason": str(exc)},
            ) from exc

    def detect(self, rgb: np.ndarray, timestamp_ms: int) -> LandmarkerObservation:
        image = self._mp.Image(image_format=self._mp.ImageFormat.SRGB, data=rgb)
        result = self._landmarker.detect_for_video(image, timestamp_ms)
        if not result.face_landmarks:
            return LandmarkerObservation(None, None, None)

        raw = result.face_landmarks[0]
        landmarks = [
            Landmark3D(x=float(pt.x), y=float(pt.y), z=float(pt.z))
            for pt in raw
        ]

        blendshapes: dict[str, float] | None = None
        if result.face_blendshapes:
            blendshapes = {}
            for category in result.face_blendshapes[0]:
                name = category.category_name or category.display_name or ""
                if not name:
                    continue
                blendshapes[name] = float(category.score)

        matrix: list[float] | None = None
        if result.facial_transformation_matrixes:
            arr = np.asarray(result.facial_transformation_matrixes[0], dtype=np.float64)
            matrix = [float(v) for v in arr.reshape(-1).tolist()]

        return LandmarkerObservation(landmarks, blendshapes, matrix)

    def close(self) -> None:
        close = getattr(self._landmarker, "close", None)
        if callable(close):
            close()
