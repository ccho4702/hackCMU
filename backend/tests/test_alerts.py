from app.schemas.analysis import (
    AnalysisConfig,
    ThresholdConfig,
    WindowAnalysis,
    WindowFeatures,
    WindowMetrics,
)
from app.scoring.alerts import AlertTracker, alerts_from_windows, classify_score


def _window(end: int, **metrics: int | None) -> WindowAnalysis:
    start = max(0, end - 1000)
    values = {
        "gaze": 80,
        "expression_activity": 80,
        "stability": 80,
        "expressiveness": 80,
        **metrics,
    }
    return WindowAnalysis(
        start_ms=start,
        end_ms=end,
        sample_count=12,
        valid_coverage=1.0,
        metrics=WindowMetrics(**values),
        features=WindowFeatures(),
    )


def test_single_low_window_does_not_alert():
    config = AnalysisConfig(alert_enter_ms=800, alert_exit_ms=1200, stride_ms=500)
    windows = [_window(1000, gaze=20)]
    assert alerts_from_windows(windows, config) == []


def test_sustained_low_gaze_creates_alert():
    config = AnalysisConfig(alert_enter_ms=800, alert_exit_ms=1200)
    windows = [
        _window(1000, gaze=22),
        _window(1500, gaze=18),
        _window(2000, gaze=19),
        _window(2500, gaze=21),
        _window(3000, gaze=85),
        _window(3500, gaze=88),
        _window(4000, gaze=90),
        _window(4500, gaze=91),
    ]
    alerts = alerts_from_windows(windows, config)
    gaze = [item for item in alerts if item.metric == "gaze"]
    assert len(gaze) == 1
    assert gaze[0].severity == "critical"
    assert gaze[0].region == "eyes"
    assert "Gaze" in gaze[0].message
    assert "nervous" not in gaze[0].message.lower()
    assert gaze[0].start_ms >= 1000
    assert gaze[0].end_ms is not None
    assert gaze[0].end_ms - gaze[0].start_ms >= 800


def test_missing_scores_do_not_enter_warning():
    config = AnalysisConfig(alert_enter_ms=800, alert_exit_ms=1200)
    windows = [
        _window(1000, gaze=None),
        _window(1500, gaze=None),
        _window(2000, gaze=None),
        _window(2500, gaze=None),
    ]
    assert alerts_from_windows(windows, config) == []


def test_recovery_requires_exit_persistence():
    tracker = AlertTracker(enter_ms=500, exit_ms=1200, hysteresis=5)
    thresholds = ThresholdConfig()
    times = [1000, 1500, 2000, 2500]
    for t in times:
        tracker.observe(t, {"gaze": 20, "expression_activity": 80, "stability": 80, "expressiveness": 80}, thresholds)
    assert tracker.active_alerts()
    tracker.observe(3000, {"gaze": 90, "expression_activity": 80, "stability": 80, "expressiveness": 80}, thresholds)
    assert tracker.active_alerts(), "a single recovered window must not clear the warning"
    tracker.observe(3500, {"gaze": 92, "expression_activity": 80, "stability": 80, "expressiveness": 80}, thresholds)
    still = tracker.active_alerts()
    tracker.observe(4200, {"gaze": 93, "expression_activity": 80, "stability": 80, "expressiveness": 80}, thresholds)
    if still:
        # 4200 - 3000 = 1200 meets exit persistence
        assert tracker.active_alerts() == []


def test_hysteresis_band_holds_warning():
    assert classify_score(62, warning=60, critical=40, hysteresis=5, current="warning") == "warning"
    assert classify_score(66, warning=60, critical=40, hysteresis=5, current="warning") == "normal"
    assert classify_score(None, warning=60, critical=40, hysteresis=5, current="warning") == "normal"
    assert classify_score(50, warning=60, critical=40, hysteresis=5, current="normal") == "warning"
