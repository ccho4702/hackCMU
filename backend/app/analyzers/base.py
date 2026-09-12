from __future__ import annotations

import threading
from pathlib import Path
from typing import Callable, Protocol

from backend.app.schemas.analysis import AnalysisConfig, AnalysisResult, VideoMetadata
from backend.app.schemas.jobs import AnalysisProgress

ProgressFn = Callable[[dict], None]


class Analyzer(Protocol):
    name: str
    mock: bool

    def analyze(
        self,
        video_path: Path,
        video: VideoMetadata,
        config: AnalysisConfig,
        *,
        analysis_id: str,
        created_at: str,
        cancel_event: threading.Event,
        progress: ProgressFn,
    ) -> AnalysisResult: ...
