"""
shadow_score — 쉐도잉 점수.

GT 문장 wav(클론 보이스 개선본)와 사용자가 따라 읽은 wav, 그리고 그 문장 텍스트를 받아
발음·속도·리듬·억양·강세 다섯 지표와 단어별 편차를 돌려준다.

GT는 사용자 본인의 클론 보이스라는 전제다. 음색이 같으니 남는 차이는 발음과 운율이다.
외부 API(ElevenLabs, Gemini)와 무관하다. 오디오가 어디서 왔는지 모른다.

사용:
    from scoring.shadow_score import score_shadowing
    result = score_shadowing("gt.wav", "user.wav", "The challenge was removing a speaker's voice.")

CLI (backend/ 에서):
    python -m scoring.shadow_score gt.wav user.wav "The challenge was removing a speaker's voice."
    python -m scoring.shadow_score gt.wav user.wav "..." --gt-words gt_words.json

첫 실행 시 torchaudio MMS_FA 가중치를 내려받는다 (1.2GB, 1회).

출력 (JSON):
    status               "ok" | "unreliable"   unreliable면 프론트는 점수를 표시하지 말 것
    reason               unreliable 사유 또는 null
    pronunciation_score  0~1. 가장 약한 단어 K개의 발음 점수 평균 (아래 words[].pron 참고)
    rate_ratio           사용자 발화 길이 / GT 발화 길이. 1.0이 일치
    rhythm_score         0~1. 전체 속도를 제거한 뒤 단어별 지속시간이 GT와 얼마나 같은 비율인가
    intonation_score     0~1. 세미톤·중앙값 정규화 F0 곡선의 DTW 거리
    stress_match         0~1. 단어별 prominence(에너지+F0 피크) 순위 상관
    word_diff[]          편차 큰 단어 상위 N개 {text, gt_dur, user_dur, ratio, dev, stress_gap, pron, note}
                         note: 발음 불명확 / 급하게 지나감 / 늘어짐 / 강세 빠짐 / 강세 과함
    words[]              전 단어의 양쪽 타임스탬프/신뢰도/prominence + pron (프론트가 파형 위에 그림)
    align_confidence     {gt, user, gt_source} 정렬 평균 신뢰도
    durations            {gt, user} 발화 구간 길이(초)

발음(pron)은 두 신호를 합친다. 둘 다 정렬 모델(wav2vec2 계열)의 부산물이라 추가 비용이 없다.
    sim       마지막 transformer 층 특징을 단어 구간에서 평균 낸 벡터의 GT-사용자 코사인 유사도.
              같은 목소리라 음색은 빠지고 "이 단어가 기준과 얼마나 다르게 들리나"가 남는다.
    conf_gap  정렬 신뢰도(기대한 글자들이 얼마나 또렷이 들렸나)가 GT보다 얼마나 떨어졌나.
    z         sim의 문장 내 z-score. 녹음 환경이 달라 sim이 전체적으로 낮아져도 "어느 단어"는 잡힌다.

전제: 사용자가 같은 문장을 읽는다. 단어를 빼먹거나 다른 말을 하면 정렬이 흐트러지고
status가 unreliable로 떨어진다. 스크립트의 숫자는 글자로 풀어 쓴다("60%" 아니라 "sixty percent").
"""
from __future__ import annotations

import argparse
import json
import math
import sys
import threading
import time
from functools import lru_cache
from pathlib import Path
from typing import Optional, Union

import librosa
import numpy as np
import soundfile as sf
import torch
import torchaudio
from scipy.stats import spearmanr

SR = 16000
HOP = 160        # 10 ms
FRAME = 1024

# ---- 튜닝 상수 (실제 부스 녹음으로 재조정 대상) ----------------------------------
FEATURE_LAYER = 24      # 발음 특징을 뽑을 transformer 층(1-based). 24 = 마지막, 글자 출력 직전
PRON_SIM_FLOOR = 0.80   # 단어 코사인이 이 값이면 sim 파트 0점, 1.0이면 만점
PRON_GAP_CEIL = 0.50    # 정렬 신뢰도 하락폭이 이 값이면 conf 파트 0점
PRON_Z_THR = -2.0       # sim의 문장 내 z-score가 이 밑이면 "발음 불명확"
PRON_GAP_THR = 0.25     # 정렬 신뢰도가 GT보다 이만큼 떨어지면 "발음 불명확"
PRON_Z_STD_FLOOR = 0.02 # sim 표준편차 하한. 전 단어가 거의 같을 때 z가 폭주하는 것 방지
PRON_BOTTOM_K = 3       # 문장 발음 점수 = 가장 낮은 단어 K개의 평균. 틀린 단어 하나가 평균에 묻히지 않게
RHYTHM_TAU = 0.25       # 단어별 log 지속시간 편차 평균이 이 값이면 score ≈ 0.37
INTONATION_TAU = 3.0    # DTW 평균 비용(세미톤)이 이 값이면 score ≈ 0.37
NOTE_THR = 0.25         # |dev| > 이 값이면 "급하게 지나감" / "늘어짐"
STRESS_GAP_THR = 1.0    # prominence 차이가 이 값 넘으면 "강세 빠짐" / "강세 과함"
MIN_WORD_DUR = 0.12     # 이보다 짧은 단어(관사 등)는 발음·강세 note 제외. 프레임이 너무 적어 불안정
ALIGN_MIN_CONF = 0.40   # 정렬 평균 신뢰도가 이 밑이면 unreliable
WORD_DIFF_TOP = 3
MIN_VOICED_FRAMES = 10

AudioLike = Union[str, Path, np.ndarray]


# =============================================================================
# 오디오
# =============================================================================
def load_audio(src: AudioLike) -> np.ndarray:
    """16 kHz mono float32. 경로 또는 이미 로드된 배열(16k 가정)을 받는다."""
    if isinstance(src, np.ndarray):
        return src.astype(np.float32)
    y, sr = sf.read(str(src), dtype="float32", always_2d=True)
    y = y.mean(axis=1)
    if sr != SR:
        y = librosa.resample(y, orig_sr=sr, target_sr=SR)
    return y


# =============================================================================
# 인코딩 + 정렬 (forced alignment)
# =============================================================================
_FEATS: dict = {}
_LOCK = threading.Lock()   # forward hook이 전역에 쓰므로 인코딩은 직렬화


@lru_cache(maxsize=1)
def _aligner():
    bundle = torchaudio.pipelines.MMS_FA
    t = time.time()
    model = bundle.get_model(with_star=False).eval()
    layer = model.model.encoder.transformer.layers[FEATURE_LAYER - 1]

    def _hook(_m, _i, out):
        _FEATS["x"] = (out[0] if isinstance(out, tuple) else out)[0]

    layer.register_forward_hook(_hook)
    print(f"[shadow_score] MMS_FA loaded in {time.time()-t:.1f}s", file=sys.stderr)
    return bundle, model, bundle.get_tokenizer(), bundle.get_aligner()


def warmup() -> None:
    """서버 시작 시 한 번 호출. 모델 로드(수십 초)를 첫 요청에서 하지 않게."""
    _aligner()


@lru_cache(maxsize=1)
def _allowed_chars() -> frozenset:
    return frozenset(torchaudio.pipelines.MMS_FA.get_dict().keys()) - {"*"}


def normalize_words(text: str) -> tuple[list[str], list[str]]:
    """(화면용 원본 단어, 정렬용 정규화 단어). 정렬 불가 단어는 ''."""
    allowed = _allowed_chars()
    display = text.replace("’", "'").split()
    norm = ["".join(ch for ch in w.lower() if ch in allowed) for w in display]
    return display, norm


def encode(y: np.ndarray) -> dict:
    """한 번의 forward로 {emission [T,C], feats [T,D], spf(프레임당 샘플 수)}."""
    _, model, _, _ = _aligner()
    wav = torch.from_numpy(y).unsqueeze(0)
    with _LOCK, torch.inference_mode():
        emission, _ = model(wav)
        feats = _FEATS.pop("x").clone()
    return {"emission": emission[0], "feats": feats, "spf": wav.size(1) / emission.size(1)}


def align_words(enc: dict, text: str) -> list[dict]:
    """각 단어의 {text, t0, t1, score}. 정렬 불가 단어는 t0/t1/score가 None."""
    display, norm = normalize_words(text)
    idx = [i for i, w in enumerate(norm) if w]
    if not idx:
        raise ValueError("정렬 가능한 단어가 없습니다: " + text)

    _, _, tokenizer, aligner = _aligner()
    with torch.inference_mode():
        spans = aligner(enc["emission"], tokenizer([norm[i] for i in idx]))
    spf = enc["spf"]

    out = [{"text": w, "t0": None, "t1": None, "score": None} for w in display]
    for k, i in enumerate(idx):
        s = spans[k]
        length = sum(sp.end - sp.start for sp in s) or 1
        score = sum(sp.score * (sp.end - sp.start) for sp in s) / length
        out[i].update(
            t0=round(s[0].start * spf / SR, 3),
            t1=round(s[-1].end * spf / SR, 3),
            score=round(float(score), 3),
        )
    return out


def _frames(w: dict, spf: float) -> tuple[int, int]:
    a = int(round(w["t0"] * SR / spf))
    return a, max(int(round(w["t1"] * SR / spf)), a + 1)


def pool_word_features(enc: dict, words: list[dict]) -> list[Optional[torch.Tensor]]:
    """단어 구간의 특징 평균 벡터. 정렬 안 된 단어는 None."""
    F, spf = enc["feats"], enc["spf"]
    out = []
    for w in words:
        if w["t0"] is None:
            out.append(None)
            continue
        a, b = _frames(w, spf)
        out.append(F[a:b].mean(0))
    return out


# =============================================================================
# 운율 특징
# =============================================================================
def f0_semitones(y: np.ndarray) -> np.ndarray:
    """프레임별 F0(세미톤, 자기 중앙값 기준). 무성 프레임은 NaN."""
    f0, vflag, _ = librosa.pyin(
        y, fmin=60, fmax=500, sr=SR, frame_length=FRAME, hop_length=HOP
    )
    st = 12.0 * np.log2(np.where(f0 > 0, f0, np.nan) / 100.0)
    st[~vflag] = np.nan
    if np.isfinite(st).any():
        st = st - np.nanmedian(st)
    return st


def energy_z(y: np.ndarray) -> np.ndarray:
    """프레임별 에너지(dB)를 발화 프레임 기준 z-score. 무음은 NaN."""
    rms = librosa.feature.rms(y=y, frame_length=FRAME, hop_length=HOP)[0]
    db = librosa.amplitude_to_db(rms + 1e-8)
    speech = db > (db.max() - 35.0)
    if speech.sum() < 2:
        return np.full_like(db, np.nan)
    mu, sd = db[speech].mean(), db[speech].std() + 1e-6
    z = (db - mu) / sd
    z[~speech] = np.nan
    return z


def _hop_frame(t: float) -> int:
    return int(round(t * SR / HOP))


def add_word_features(words: list[dict], st: np.ndarray, ez: np.ndarray) -> None:
    """각 단어에 f0_max, energy, prominence를 붙인다(in place)."""
    for w in words:
        w["f0_max"] = w["energy"] = w["prominence"] = None
        if w["t0"] is None:
            continue
        a, b = _hop_frame(w["t0"]), max(_hop_frame(w["t1"]), _hop_frame(w["t0"]) + 1)
        seg_st, seg_e = st[a:b], ez[a:b]
        if np.isfinite(seg_st).any():
            w["f0_max"] = float(np.nanmax(seg_st))
        if np.isfinite(seg_e).any():
            w["energy"] = float(np.nanmean(seg_e))

    def z(key):
        vals = np.array([w[key] if w[key] is not None else np.nan for w in words], float)
        if np.isfinite(vals).sum() < 2:
            return np.full_like(vals, np.nan)
        return (vals - np.nanmean(vals)) / (np.nanstd(vals) + 1e-6)

    zf, ze = z("f0_max"), z("energy")
    for w, a, b in zip(words, zf, ze):
        parts = [v for v in (a, b) if np.isfinite(v)]
        w["prominence"] = round(float(sum(parts)), 3) if parts else None


# =============================================================================
# 발음
# =============================================================================
def _clip01(x: float) -> float:
    return min(max(x, 0.0), 1.0)


def add_pronunciation(gw: list[dict], uw: list[dict],
                      pg: list[Optional[torch.Tensor]], pu: list[Optional[torch.Tensor]]) -> None:
    """사용자 단어 dict에 pron = {sim, conf_gap, z, score}를 붙인다(in place)."""
    sims = []
    for g, u, a, b in zip(gw, uw, pg, pu):
        u["pron"] = None
        if a is None or b is None:
            sims.append(np.nan)
            continue
        sim = float(torch.nn.functional.cosine_similarity(a, b, dim=0))
        gap = (g["score"] - u["score"]) if (g["score"] is not None and u["score"] is not None) else 0.0
        sim_part = _clip01((sim - PRON_SIM_FLOOR) / (1.0 - PRON_SIM_FLOOR))
        gap_part = _clip01(1.0 - max(gap, 0.0) / PRON_GAP_CEIL)
        u["pron"] = {
            "sim": round(sim, 3),
            "conf_gap": round(gap, 3),
            "z": None,
            "score": round(0.5 * sim_part + 0.5 * gap_part, 3),
        }
        sims.append(sim)

    v = np.array(sims, float)
    m = np.isfinite(v)
    if m.sum() >= 3:
        zs = (v - v[m].mean()) / max(float(v[m].std()), PRON_Z_STD_FLOOR)
        for u, zi, ok in zip(uw, zs, m):
            if ok and u["pron"] is not None:
                u["pron"]["z"] = round(float(zi), 2)


def metric_pronunciation(uw: list[dict]) -> Optional[float]:
    """가장 약한 단어 K개의 평균. 문장은 가장 약한 단어만큼 또렷하다."""
    s = sorted(u["pron"]["score"] for u in uw if u.get("pron"))
    return round(float(np.mean(s[:PRON_BOTTOM_K])), 3) if s else None


# =============================================================================
# 운율 지표
# =============================================================================
def _span(words: list[dict]) -> Optional[tuple[float, float]]:
    ts = [(w["t0"], w["t1"]) for w in words if w["t0"] is not None]
    return (ts[0][0], ts[-1][1]) if ts else None


def metric_rate(gw: list[dict], uw: list[dict]) -> Optional[float]:
    g, u = _span(gw), _span(uw)
    if not g or not u or g[1] - g[0] <= 0:
        return None
    return round((u[1] - u[0]) / (g[1] - g[0]), 3)


def metric_rhythm(gw: list[dict], uw: list[dict]) -> tuple[Optional[float], list[Optional[float]]]:
    """(score, 단어별 centered log ratio). 전체 속도는 빼고 단어별 편차만 본다."""
    logs, keep = [], []
    for i, (g, u) in enumerate(zip(gw, uw)):
        if g["t0"] is None or u["t0"] is None:
            continue
        gd, ud = g["t1"] - g["t0"], u["t1"] - u["t0"]
        if gd <= 0.02 or ud <= 0.02:
            continue
        logs.append(math.log(ud / gd))
        keep.append(i)
    dev = [None] * len(gw)
    if len(logs) < 2:
        return None, dev
    c = np.array(logs) - np.mean(logs)
    for i, v in zip(keep, c):
        dev[i] = round(float(v), 3)
    return round(float(math.exp(-np.mean(np.abs(c)) / RHYTHM_TAU)), 3), dev


def metric_intonation(st_g: np.ndarray, st_u: np.ndarray) -> Optional[float]:
    a, b = st_g[np.isfinite(st_g)], st_u[np.isfinite(st_u)]
    if len(a) < MIN_VOICED_FRAMES or len(b) < MIN_VOICED_FRAMES:
        return None
    D, wp = librosa.sequence.dtw(X=a[None, :], Y=b[None, :], metric="euclidean")
    cost = D[-1, -1] / len(wp)
    return round(float(math.exp(-cost / INTONATION_TAU)), 3)


def metric_stress(gw: list[dict], uw: list[dict]) -> Optional[float]:
    pairs = [(g["prominence"], u["prominence"]) for g, u in zip(gw, uw)
             if g["prominence"] is not None and u["prominence"] is not None]
    if len(pairs) < 3:
        return None
    rho, _ = spearmanr([p[0] for p in pairs], [p[1] for p in pairs])
    if not np.isfinite(rho):
        return None
    return round(float((rho + 1) / 2), 3)


# =============================================================================
# 단어별 편차
# =============================================================================
def word_diff(gw: list[dict], uw: list[dict], dev: list[Optional[float]]) -> list[dict]:
    rows = []
    for g, u, d in zip(gw, uw, dev):
        if g["t0"] is None or u["t0"] is None:
            continue
        gd, ud = g["t1"] - g["t0"], u["t1"] - u["t0"]
        long_enough = gd >= MIN_WORD_DUR

        p = u.get("pron")
        sev_pron = 0.0
        if p and long_enough:
            z_part = (p["z"] / PRON_Z_THR) if p["z"] is not None else 0.0   # z == THR → 1.0
            g_part = p["conf_gap"] / PRON_GAP_THR                            # gap == THR → 1.0
            sev_pron = max(z_part, g_part, 0.0)

        sev_dur = abs(d) / NOTE_THR if d is not None else 0.0

        gap = (g["prominence"] - u["prominence"]) if (
            g["prominence"] is not None and u["prominence"] is not None) else None
        sev_str = abs(gap) / STRESS_GAP_THR if (gap is not None and long_enough) else 0.0

        if sev_pron >= 1.0:
            note = "발음 불명확"
        elif sev_dur > 1.0:
            note = "급하게 지나감" if d < 0 else "늘어짐"
        elif sev_str > 1.0:
            note = "강세 빠짐" if gap > 0 else "강세 과함"
        else:
            note = None

        rows.append({
            "text": g["text"],
            "gt_dur": round(gd, 3), "user_dur": round(ud, 3),
            "ratio": round(ud / gd, 3) if gd > 0 else None,
            "dev": d,
            "stress_gap": round(gap, 3) if gap is not None else None,
            "pron": p["score"] if p else None,
            "note": note,
            "_sev": max(sev_pron, sev_dur, sev_str),
        })
    rows.sort(key=lambda r: -r["_sev"])
    for r in rows:
        r.pop("_sev")
    return [r for r in rows if r["note"]][:WORD_DIFF_TOP]


# =============================================================================
# 진입점
# =============================================================================
def score_shadowing(
    gt_wav: AudioLike,
    user_wav: AudioLike,
    text: str,
    gt_words: Optional[list[dict]] = None,
) -> dict:
    """
    gt_wav, user_wav : 경로 또는 16k float32 배열
    text             : 두 오디오가 읽은 문장
    gt_words         : (선택) [{text?, t0, t1}] GT 단어 타임스탬프. ElevenLabs 응답을 접은 것.
                       단어 수가 맞으면 GT 단어 구간을 이걸로 덮어쓴다(프론트 하이라이트와 일치시키려고).
                       정렬 신뢰도 계산을 위해 GT도 정렬 자체는 한다.
    """
    yg, yu = load_audio(gt_wav), load_audio(user_wav)
    display, _ = normalize_words(text)

    enc_g, enc_u = encode(yg), encode(yu)
    gw, uw = align_words(enc_g, text), align_words(enc_u, text)

    gt_source = "aligned"
    if gt_words and len(gt_words) == len(display):
        for w, e in zip(gw, gt_words):
            w["t0"], w["t1"] = float(e["t0"]), float(e["t1"])
        gt_source = "external"

    # 발음
    add_pronunciation(gw, uw, pool_word_features(enc_g, gw), pool_word_features(enc_u, uw))

    # 운율
    st_g, st_u = f0_semitones(yg), f0_semitones(yu)
    ez_g, ez_u = energy_z(yg), energy_z(yu)
    add_word_features(gw, st_g, ez_g)
    add_word_features(uw, st_u, ez_u)

    def conf(ws):
        s = [w["score"] for w in ws if w["score"] is not None]
        return round(float(np.mean(s)), 3) if s else None

    conf_g, conf_u = conf(gw), conf(uw)
    n_aligned_u = sum(w["t0"] is not None for w in uw)

    status, reason = "ok", None
    if conf_u is not None and conf_u < ALIGN_MIN_CONF:
        status, reason = "unreliable", f"user alignment confidence {conf_u} < {ALIGN_MIN_CONF}"
    elif n_aligned_u < max(2, len(display) // 2):
        status, reason = "unreliable", f"only {n_aligned_u}/{len(display)} words aligned"

    rhythm, dev = metric_rhythm(gw, uw)
    g_span, u_span = _span(gw), _span(uw)

    def side(w):
        return {k: w[k] for k in ("t0", "t1", "score", "prominence")}

    return {
        "status": status,
        "reason": reason,
        "pronunciation_score": metric_pronunciation(uw),
        "rate_ratio": metric_rate(gw, uw),
        "rhythm_score": rhythm,
        "intonation_score": metric_intonation(st_g, st_u),
        "stress_match": metric_stress(gw, uw),
        "word_diff": word_diff(gw, uw, dev),
        "words": [{"text": g["text"], "gt": side(g), "user": side(u), "pron": u["pron"]}
                  for g, u in zip(gw, uw)],
        "align_confidence": {"gt": conf_g, "user": conf_u, "gt_source": gt_source},
        "durations": {
            "gt": round(g_span[1] - g_span[0], 3) if g_span else None,
            "user": round(u_span[1] - u_span[0], 3) if u_span else None,
        },
    }


# =============================================================================
# CLI
# =============================================================================
def _main(argv=None):
    p = argparse.ArgumentParser(description="쉐도잉 점수: GT wav vs 사용자 wav")
    p.add_argument("gt_wav")
    p.add_argument("user_wav")
    p.add_argument("text")
    p.add_argument("--gt-words", help="GT 단어 타임스탬프 JSON [{text,t0,t1}]")
    p.add_argument("--compact", action="store_true", help="words[] 생략")
    a = p.parse_args(argv)

    gt_words = json.load(open(a.gt_words)) if a.gt_words else None
    t = time.time()
    r = score_shadowing(a.gt_wav, a.user_wav, a.text, gt_words)
    print(f"[shadow_score] done in {time.time()-t:.1f}s", file=sys.stderr)
    if a.compact:
        r.pop("words")
    print(json.dumps(r, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    _main()
