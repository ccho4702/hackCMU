from __future__ import annotations

from typing import Protocol

from backend.app.schemas.analysis import AnalysisConfig, WindowFeatures


class ScoringStrategy(Protocol):
    version: str

    def score_gaze(self, features: WindowFeatures, config: AnalysisConfig) -> float | None: ...

    def score_expression_activity(
        self, features: WindowFeatures, config: AnalysisConfig
    ) -> float | None: ...

    def score_stability(self, features: WindowFeatures, config: AnalysisConfig) -> float | None: ...

    def score_expressiveness(
        self, features: WindowFeatures, config: AnalysisConfig
    ) -> float | None: ...
