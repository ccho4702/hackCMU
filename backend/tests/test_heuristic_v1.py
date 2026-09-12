from backend.app.features.au_map import AU_BLENDSHAPE_NAMES, au_channel_names
from backend.app.features.gaze_estimator import GAZE_ON_CAMERA_RADIUS, camera_occupancy
from backend.app.schemas.analysis import AnalysisConfig, WindowFeatures
from backend.app.scoring.heuristic_v1 import HeuristicV1Strategy


def test_modest_gaze_drift_stays_above_warning():
    strategy = HeuristicV1Strategy()
    features = WindowFeatures(gaze_horizontal_mean=0.16, gaze_vertical_mean=0.0)
    score = strategy.score_gaze(features, AnalysisConfig())
    assert score is not None
    assert score >= 64


def test_clear_gaze_lookaway_scores_below_warning():
    strategy = HeuristicV1Strategy()
    features = WindowFeatures(gaze_horizontal_mean=0.28, gaze_vertical_mean=0.0)
    score = strategy.score_gaze(features, AnalysisConfig())
    assert score is not None
    assert score < 64


def test_camera_aligned_gaze_stays_high():
    strategy = HeuristicV1Strategy()
    features = WindowFeatures(gaze_horizontal_mean=0.04, gaze_vertical_mean=0.03)
    score = strategy.score_gaze(features, AnalysisConfig())
    assert score is not None
    assert score >= 88


def test_high_occupancy_keeps_gaze_score_high():
    strategy = HeuristicV1Strategy()
    features = WindowFeatures(
        gaze_horizontal_mean=0.10,
        gaze_vertical_mean=0.0,
        gaze_camera_occupancy=0.90,
    )
    score = strategy.score_gaze(features, AnalysisConfig())
    assert score is not None
    assert score >= 80


def test_low_occupancy_drops_gaze_below_warning():
    strategy = HeuristicV1Strategy()
    features = WindowFeatures(
        gaze_horizontal_mean=0.10,
        gaze_vertical_mean=0.0,
        gaze_camera_occupancy=0.35,
    )
    score = strategy.score_gaze(features, AnalysisConfig())
    assert score is not None
    assert score < 64


def test_frozen_au_intensity_caps_activity():
    strategy = HeuristicV1Strategy()
    features = WindowFeatures(
        expression_velocity=0.20,
        blendshape_variance=0.0002,
        au_intensity_mean=0.02,
    )
    score = strategy.score_expression_activity(features, AnalysisConfig())
    assert score is not None
    assert score <= 38


def test_camera_occupancy_counts_on_camera_frames():
    assert camera_occupancy([]) is None
    radius = GAZE_ON_CAMERA_RADIUS
    occupancy = camera_occupancy(
        [(0.0, 0.0), (radius, 0.0), (radius + 0.2, 0.0), (0.5, 0.5)]
    )
    assert occupancy == 0.5


def test_au_channels_exclude_blinks_and_looks():
    names = au_channel_names(
        {
            "mouthSmileLeft": 0.4,
            "eyeBlinkLeft": 0.9,
            "eyeLookOutLeft": 0.5,
            "jawOpen": 0.2,
        }
    )
    assert names == ["mouthSmileLeft", "jawOpen"]
    assert "eyeBlinkLeft" not in AU_BLENDSHAPE_NAMES
    assert "eyeLookOutLeft" not in AU_BLENDSHAPE_NAMES
