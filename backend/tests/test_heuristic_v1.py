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
