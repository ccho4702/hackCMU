from __future__ import annotations

from typing import Any

SCHEMA_VERSION = "1.1.0"
SCORING_VERSION = "heuristic_v1"

DEFAULT_ANALYSIS_FPS = 12.0
DEFAULT_WINDOW_SIZE_MS = 1000
DEFAULT_STRIDE_MS = 500
DEFAULT_MINIMUM_VALID_COVERAGE = 0.7
DEFAULT_SMOOTHING_ALPHA = 0.35
DEFAULT_MIN_SEGMENT_DURATION_MS = 1500
DEFAULT_MERGE_GAP_MS = 750
DEFAULT_STRONG_SCORE = 82
DEFAULT_MIN_STRONG_DURATION_MS = 2000
DEFAULT_ALERT_ENTER_MS = 800
DEFAULT_ALERT_EXIT_MS = 1200
DEFAULT_ALERT_HYSTERESIS = 5

# Observable presentation copy only. Never infer emotion, trait, or mental state.
ALERT_REGIONS: dict[str, str] = {
    "gaze": "eyes",
    "expression_activity": "mouth_brows",
    "stability": "contour",
    "expressiveness": "mouth_brows",
}

ALERT_MESSAGES: dict[str, dict[str, str]] = {
    "gaze": {
        "warning": "Gaze drift detected",
        "critical": "Gaze drifting away from camera",
    },
    "expression_activity": {
        "warning": "Low facial activity",
        "critical": "Sustained low facial activity",
    },
    "stability": {
        "warning": "Elevated head movement",
        "critical": "Excessive head movement",
    },
    "expressiveness": {
        "warning": "Narrow facial range",
        "critical": "Very limited facial range",
    },
}

DEFAULT_THRESHOLDS: dict[str, dict[str, int]] = {
    "gaze": {"warning": 60, "critical": 40},
    "expressionActivity": {"warning": 55, "critical": 35},
    "stability": {"warning": 65, "critical": 45},
    "expressiveness": {"warning": 55, "critical": 35},
}

# Piecewise maps: (x, score). Transparent, monotonic in segments.
GAZE_DEVIATION_BREAKPOINTS: list[tuple[float, float]] = [
    (0.0, 100.0),
    (0.12, 92.0),
    (0.22, 74.0),
    (0.35, 48.0),
    (0.55, 22.0),
    (0.85, 0.0),
]

# Blendshape L2 velocity per second.
ACTIVITY_VELOCITY_BREAKPOINTS: list[tuple[float, float]] = [
    (0.00, 28.0),
    (0.06, 48.0),
    (0.16, 88.0),
    (0.28, 100.0),
    (0.50, 82.0),
    (0.90, 48.0),
    (1.50, 18.0),
]

# Head angular speed in degrees / second (RMS of yaw/pitch/roll rates).
STABILITY_VELOCITY_BREAKPOINTS: list[tuple[float, float]] = [
    (0.0, 90.0),
    (8.0, 100.0),
    (18.0, 86.0),
    (32.0, 62.0),
    (55.0, 34.0),
    (90.0, 12.0),
    (140.0, 0.0),
]

# Robust blendshape range (mean of per-signal p90-p10).
EXPRESSIVENESS_RANGE_BREAKPOINTS: list[tuple[float, float]] = [
    (0.01, 18.0),
    (0.04, 42.0),
    (0.10, 78.0),
    (0.18, 100.0),
    (0.32, 90.0),
    (0.50, 70.0),
]


def default_analysis_config() -> dict[str, Any]:
    return {
        "analysisFps": DEFAULT_ANALYSIS_FPS,
        "windowSizeMs": DEFAULT_WINDOW_SIZE_MS,
        "strideMs": DEFAULT_STRIDE_MS,
        "minimumValidCoverage": DEFAULT_MINIMUM_VALID_COVERAGE,
        "smoothingAlpha": DEFAULT_SMOOTHING_ALPHA,
        "minSegmentDurationMs": DEFAULT_MIN_SEGMENT_DURATION_MS,
        "mergeGapMs": DEFAULT_MERGE_GAP_MS,
        "strongScore": DEFAULT_STRONG_SCORE,
        "minStrongDurationMs": DEFAULT_MIN_STRONG_DURATION_MS,
        "alertEnterMs": DEFAULT_ALERT_ENTER_MS,
        "alertExitMs": DEFAULT_ALERT_EXIT_MS,
        "alertHysteresis": DEFAULT_ALERT_HYSTERESIS,
        "thresholds": DEFAULT_THRESHOLDS,
    }
