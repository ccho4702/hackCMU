"""
trial 요약. 문장별 쉐도잉 점수를 축별 평균으로 접고, 정렬용 overall 을 만든다.

overall 은 다섯 축의 가중치 없는 평균이다. "가장 높은 trial" 을 고르는 데만 쓰고
화면에는 다섯 축을 따로 보여주는 게 원칙이다. 가중치를 안 두는 이유는
"왜 이 숫자냐" 에 답할 수 있어야 하기 때문이다.

축
    pronunciation  scorer 의 pronunciation_score
    rate           1 - |1 - rate_ratio|  (1.0 이 GT 와 같은 속도)
    rhythm         rhythm_score
    intonation     intonation_score
    stress         stress_match
"""
from __future__ import annotations

from typing import Optional

AXES = ("pronunciation", "rate", "rhythm", "intonation", "stress")


def _rate_closeness(r: Optional[float]) -> Optional[float]:
    if r is None:
        return None
    return round(max(0.0, 1.0 - min(abs(1.0 - r), 1.0)), 3)


def sentence_axes(s: dict) -> dict:
    return {
        "pronunciation": s.get("pronunciation_score"),
        "rate": _rate_closeness(s.get("rate_ratio")),
        "rhythm": s.get("rhythm_score"),
        "intonation": s.get("intonation_score"),
        "stress": s.get("stress_match"),
    }


def _mean(vals: list) -> Optional[float]:
    vals = [v for v in vals if v is not None]
    return round(sum(vals) / len(vals), 3) if vals else None


def compute_summary(shadowing: list[dict]) -> Optional[dict]:
    """status == ok 인 문장만 집계. 하나도 없으면 None."""
    ok = [s for s in shadowing if s.get("status") == "ok"]
    if not ok:
        return None
    per = [sentence_axes(s) for s in ok]
    axes = {a: _mean([p[a] for p in per]) for a in AXES}
    return {
        "axes": axes,
        "overall": _mean(list(axes.values())),
        "n_scored": len(ok),
        "n_sentences": len(shadowing),
    }
