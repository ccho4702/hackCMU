from __future__ import annotations

from app.core.defaults import (
    ACTIVITY_VELOCITY_BREAKPOINTS,
    EXPRESSIVENESS_RANGE_BREAKPOINTS,
    GAZE_DEVIATION_BREAKPOINTS,
    SCORING_VERSION,
    STABILITY_VELOCITY_BREAKPOINTS,
)
from app.schemas.analysis import AnalysisConfig, WindowFeatures
from app.utils.piecewise import clamp_score, piecewise_linear


class HeuristicV1Strategy:
    """Deterministic presentation-delivery heuristics.

    All maps are piecewise-linear and configurable. Insufficient evidence
    returns None rather than 0.
    """

    version = SCORING_VERSION

    def score_gaze(self, features: WindowFeatures, config: AnalysisConfig) -> float | None:
        if features.gaze_horizontal_mean is None or features.gaze_vertical_mean is None:
            return None
        deviation = (features.gaze_horizontal_mean**2 + features.gaze_vertical_mean**2) ** 0.5
        return clamp_score(piecewise_linear(deviation, GAZE_DEVIATION_BREAKPOINTS))

    def score_expression_activity(
        self, features: WindowFeatures, config: AnalysisConfig
    ) -> float | None:
        if features.expression_velocity is None:
            return None
        score = piecewise_linear(features.expression_velocity, ACTIVITY_VELOCITY_BREAKPOINTS)
        if features.blendshape_variance is not None and features.blendshape_variance < 0.0004:
            score = min(score, 42.0)
        return clamp_score(score)

    def score_stability(self, features: WindowFeatures, config: AnalysisConfig) -> float | None:
        if features.head_angular_speed is None:
            return None
        score = piecewise_linear(features.head_angular_speed, STABILITY_VELOCITY_BREAKPOINTS)
        if features.jitter is not None:
            # Bounded penalty for high-frequency jitter; slow intentional motion
            # is already represented by angular speed.
            penalty = min(28.0, features.jitter * 0.35)
            score -= penalty
        return clamp_score(score)

    def score_expressiveness(
        self, features: WindowFeatures, config: AnalysisConfig
    ) -> float | None:
        if features.expressiveness_range is None:
            return None
        score = piecewise_linear(features.expressiveness_range, EXPRESSIVENESS_RANGE_BREAKPOINTS)
        if features.activation_diversity is not None:
            # Small bounded bonus for using a broader set of facial actions.
            score += 8.0 * max(0.0, min(1.0, features.activation_diversity))
        return clamp_score(score)
