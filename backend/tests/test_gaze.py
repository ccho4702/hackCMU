from app.analyzers.mock_analyzer import synthetic_frame
from app.features.gaze_estimator import estimate_gaze
from app.features.landmark_normalizer import landmarks_to_array


def test_blink_frame_is_not_valid_gaze():
    frame = synthetic_frame(0, 8000, gap_start=10_000, gap_end=11_000)
    assert frame.blendshapes is not None
    frame.blendshapes["eyeBlinkLeft"] = 0.95
    frame.blendshapes["eyeBlinkRight"] = 0.95
    # Collapse eyelids in landmark geometry.
    pts = landmarks_to_array(frame.landmarks)
    pts[159] = pts[145]
    pts[386] = pts[374]
    gaze = estimate_gaze(pts, frame.head_pose, ear_closed=0.15)
    assert gaze.valid is False
