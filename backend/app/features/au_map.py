from __future__ import annotations

from typing import Mapping

import numpy as np

# MediaPipe / ARKit blendshapes that correspond to FACS Action Units used as
# delivery intensity channels. Values stay in [0, 1], i.e. AU intensity / 5.
# Blinks (AU45) and eyeLook* are excluded: blinks invalidate gaze, look offsets
# are scored as gaze, not as facial range.
#
# Sanchez-Lozano et al., IEEE TAFFC 2021: expressions are local AU intensities,
# not emotion class labels.
AU_BLENDSHAPE_NAMES: tuple[str, ...] = (
    "browInnerUp",
    "browOuterUpLeft",
    "browOuterUpRight",
    "browDownLeft",
    "browDownRight",
    "eyeWideLeft",
    "eyeWideRight",
    "cheekSquintLeft",
    "cheekSquintRight",
    "eyeSquintLeft",
    "eyeSquintRight",
    "noseSneerLeft",
    "noseSneerRight",
    "mouthUpperUpLeft",
    "mouthUpperUpRight",
    "mouthSmileLeft",
    "mouthSmileRight",
    "mouthDimpleLeft",
    "mouthDimpleRight",
    "mouthFrownLeft",
    "mouthFrownRight",
    "mouthShrugLower",
    "mouthShrugUpper",
    "mouthStretchLeft",
    "mouthStretchRight",
    "mouthPressLeft",
    "mouthPressRight",
    "jawOpen",
    "mouthClose",
    "mouthFunnel",
    "mouthPucker",
    "mouthLowerDownLeft",
    "mouthLowerDownRight",
)


def au_channel_names(blendshapes: Mapping[str, float] | None) -> list[str] | None:
    if not blendshapes:
        return None
    names = [name for name in AU_BLENDSHAPE_NAMES if name in blendshapes]
    return names or None


def au_intensity_vector(
    blendshapes: Mapping[str, float] | None,
    names: list[str] | None = None,
) -> np.ndarray | None:
    channels = names or au_channel_names(blendshapes)
    if not blendshapes or not channels:
        return None
    return np.array([float(blendshapes.get(n, 0.0)) for n in channels], dtype=np.float64)


def mean_au_intensity(window_vectors: list[np.ndarray]) -> float | None:
    if len(window_vectors) < 1:
        return None
    stacked = np.stack(window_vectors, axis=0)
    return float(np.mean(stacked))
