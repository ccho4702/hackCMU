from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from app.features.blendshape_features import (
    activation_diversity,
    blendshape_variance,
    ordered_values,
    robust_range,
)
from app.features.temporal_features import jitter_from_speeds, mean_or_none
from app.schemas.analysis import FrameAnalysis, WindowAnalysis, WindowFeatures, WindowMetrics
from app.scoring.strategy import ScoringStrategy
from app.utils.piecewise import round_score


@dataclass
class PreparedFrame:
    frame: FrameAnalysis
    velocity: float | None
    angular_speed: float | None
    vector: np.ndarray | None


def build_windows(
    frames: list[FrameAnalysis],
    prepared: list[PreparedFrame],
    *,
    window_size_ms: int,
    stride_ms: int,
    minimum_valid_coverage: float,
    strategy: ScoringStrategy,
    config,
) -> list[WindowAnalysis]:
    if not frames:
        return []
    duration = frames[-1].timestamp_ms
    windows = []
    start = 0
    while start <= duration:
        end = start + window_size_ms
        selected = [
            p
            for p in prepared
            if start <= p.frame.timestamp_ms < end
        ]
        windows.append(
            _score_window(
                start,
                end,
                selected,
                minimum_valid_coverage,
                strategy,
                config,
            )
        )
        if end >= duration and start != 0:
            break
        start += stride_ms
        if start > duration:
            break
    return windows


def _score_window(
    start: int,
    end: int,
    selected: list[PreparedFrame],
    min_coverage: float,
    strategy: ScoringStrategy,
    config,
) -> WindowAnalysis:
    sample_count = len(selected)
    if sample_count == 0:
        return WindowAnalysis(
            start_ms=start,
            end_ms=end,
            sample_count=0,
            valid_coverage=0.0,
            metrics=WindowMetrics(),
            features=WindowFeatures(),
        )

    face_n = sum(1 for p in selected if p.frame.quality.face_detected)
    gaze_n = sum(1 for p in selected if p.frame.quality.gaze_valid)
    pose_n = sum(1 for p in selected if p.frame.quality.pose_valid)
    bs_n = sum(1 for p in selected if p.frame.quality.blendshapes_valid)
    valid_coverage = face_n / sample_count

    vectors = [p.vector for p in selected if p.vector is not None]
    features = WindowFeatures(
        head_yaw_mean=mean_or_none(
            [p.frame.head_pose.yaw_deg for p in selected if p.frame.head_pose]
        ),
        head_pitch_mean=mean_or_none(
            [p.frame.head_pose.pitch_deg for p in selected if p.frame.head_pose]
        ),
        head_roll_mean=mean_or_none(
            [p.frame.head_pose.roll_deg for p in selected if p.frame.head_pose]
        ),
        gaze_horizontal_mean=mean_or_none(
            [p.frame.gaze.horizontal for p in selected if p.frame.quality.gaze_valid and p.frame.gaze]
        ),
        gaze_vertical_mean=mean_or_none(
            [p.frame.gaze.vertical for p in selected if p.frame.quality.gaze_valid and p.frame.gaze]
        ),
        blendshape_variance=blendshape_variance(vectors) if vectors else None,
        expression_velocity=mean_or_none([p.velocity for p in selected if p.velocity is not None]),
        head_angular_speed=mean_or_none(
            [p.angular_speed for p in selected if p.angular_speed is not None]
        ),
        jitter=jitter_from_speeds(
            [p.angular_speed for p in selected if p.angular_speed is not None]
        ),
        expressiveness_range=robust_range(vectors) if vectors else None,
        activation_diversity=activation_diversity(vectors) if vectors else None,
    )

    def gated(count: int, scorer) -> int | None:
        if sample_count == 0 or (count / sample_count) < min_coverage:
            return None
        return round_score(scorer(features, config))

    metrics = WindowMetrics(
        gaze=gated(gaze_n, strategy.score_gaze),
        expression_activity=gated(bs_n, strategy.score_expression_activity),
        stability=gated(pose_n, strategy.score_stability),
        expressiveness=gated(bs_n, strategy.score_expressiveness),
    )
    return WindowAnalysis(
        start_ms=start,
        end_ms=end,
        sample_count=sample_count,
        valid_coverage=valid_coverage,
        metrics=metrics,
        features=features,
    )


def score_time_window(
    prepared: list[PreparedFrame],
    start_ms: int,
    end_ms: int,
    *,
    minimum_valid_coverage: float,
    strategy: ScoringStrategy,
    config,
) -> WindowAnalysis:
    selected = [p for p in prepared if start_ms <= p.frame.timestamp_ms < end_ms]
    return _score_window(
        start_ms,
        end_ms,
        selected,
        minimum_valid_coverage,
        strategy,
        config,
    )


def prepare_next_frame(
    frame: FrameAnalysis,
    prev: FrameAnalysis | None,
    names: list[str] | None,
) -> tuple[PreparedFrame, list[str] | None]:
    from app.features.blendshape_features import expression_velocity
    from app.features.temporal_features import angular_speed_deg_s

    dt = ((frame.timestamp_ms - prev.timestamp_ms) / 1000.0) if prev else 0.0
    if names is None and frame.blendshapes:
        names = list(frame.blendshapes.keys())
    vel = (
        expression_velocity(prev.blendshapes if prev else None, frame.blendshapes, dt, names)
        if prev
        else None
    )
    speed = (
        angular_speed_deg_s(prev.head_pose if prev else None, frame.head_pose, dt)
        if prev
        else None
    )
    vector = ordered_values(frame.blendshapes, names)
    return PreparedFrame(frame=frame, velocity=vel, angular_speed=speed, vector=vector), names


def prepare_frames(frames: list[FrameAnalysis]) -> list[PreparedFrame]:
    prepared: list[PreparedFrame] = []
    names: list[str] | None = None
    prev: FrameAnalysis | None = None
    for frame in frames:
        item, names = prepare_next_frame(frame, prev, names)
        prepared.append(item)
        prev = frame
    return prepared
