from __future__ import annotations

from backend.app.schemas.analysis import FrameAnalysis, FrameQuality, GazeEstimate, HeadPose, Landmark3D


def frame_quality(
    landmarks: list[Landmark3D] | None,
    blendshapes: dict[str, float] | None,
    pose: HeadPose | None,
    gaze: GazeEstimate | None,
) -> FrameQuality:
    face = landmarks is not None and len(landmarks) >= 400
    return FrameQuality(
        face_detected=face,
        gaze_valid=bool(face and gaze is not None and gaze.valid),
        pose_valid=bool(face and pose is not None),
        blendshapes_valid=bool(face and blendshapes is not None and len(blendshapes) > 0),
    )


def coverage(frames: list[FrameAnalysis], attr: str) -> float:
    if not frames:
        return 0.0
    n = sum(1 for f in frames if getattr(f.quality, attr))
    return n / len(frames)
