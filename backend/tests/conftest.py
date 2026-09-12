from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


@pytest.fixture
def identity_matrix() -> np.ndarray:
    return np.eye(4)


@pytest.fixture(autouse=True)
def isolate_external_database_and_language(monkeypatch):
    # Unit tests must not contact a developer's Atlas database or inherit preferences.
    monkeypatch.setenv("MONGODB_URI", "")
    monkeypatch.delenv("PRESENTATION_LANGUAGE", raising=False)
