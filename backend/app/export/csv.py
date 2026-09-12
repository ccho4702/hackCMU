from __future__ import annotations

import csv
import io

from backend.app.schemas.analysis import AnalysisResult


def result_to_json_bytes(result: AnalysisResult, *, include_frames: bool) -> bytes:
    payload = result.model_copy(deep=True)
    if not include_frames:
        payload.frames = []
    return payload.model_dump_json(by_alias=True).encode("utf-8")


def windows_to_csv(result: AnalysisResult) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "startMs",
            "endMs",
            "gaze",
            "expressionActivity",
            "stability",
            "expressiveness",
            "validCoverage",
            "sampleCount",
            "headYawMean",
            "headPitchMean",
            "blendshapeVariance",
            "expressionVelocity",
            "gazeCameraOccupancy",
            "auIntensityMean",
        ]
    )
    for window in result.windows:
        writer.writerow(
            [
                window.start_ms,
                window.end_ms,
                _num(window.metrics.gaze),
                _num(window.metrics.expression_activity),
                _num(window.metrics.stability),
                _num(window.metrics.expressiveness),
                window.valid_coverage,
                window.sample_count,
                _num(window.features.head_yaw_mean),
                _num(window.features.head_pitch_mean),
                _num(window.features.blendshape_variance),
                _num(window.features.expression_velocity),
                _num(window.features.gaze_camera_occupancy),
                _num(window.features.au_intensity_mean),
            ]
        )
    return buffer.getvalue()


def _num(value: int | float | None):
    if value is None:
        return ""
    return value
