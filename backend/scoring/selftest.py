"""
쉐도잉 점수 셀프테스트. 환경이 제대로 잡혔는지, 지표가 기대한 방향으로 움직이는지 확인한다.

macOS `say`의 같은 목소리(Samantha)로 GT를 만들고, 사용자 자리에는
속도를 바꾼 것과 단어 하나를 바꿔 읽은 것을 넣는다. GT가 본인 클론 보이스라는 실제 조건과 같게
목소리는 바꾸지 않는다. 녹음도 API 키도 필요 없다. 첫 실행은 MMS_FA 가중치 다운로드(1.2GB) 때문에 1분쯤 걸린다.

    cd backend
    python -m scoring.selftest
    python -m scoring.selftest --dir /tmp/shadow_test   # 오디오 보존

기대:
    동일 파일          → 다섯 지표 전부 1.0
    느리게 / 빠르게    → rate_ratio가 방향대로, 발음 오탐 없음
    단어 하나 바꿔 읽음 → 그 단어가 word_diff 맨 위에 "발음 불명확"으로, pronunciation_score 하락
"""
import argparse
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

TEXT = "The challenge was removing a speaker's voice from a trained model without retraining it from scratch."
VOICE = "Samantha"
CASES = [  # (이름, 설명, 속도, (원래 단어, 바꿔 읽을 단어) 또는 None)
    ("user_same", "동일 파일",           None, None),
    ("user_slow", "느리게",              130,  None),
    ("user_fast", "빠르게",              210,  None),
    ("user_sub1", "removing→renewing",   170,  ("removing", "renewing")),
    ("user_sub2", "speaker's→seeker's",  170,  ("speaker's", "seeker's")),
    ("user_sub3", "trained→drained",     170,  ("trained", "drained")),
]


def synth(out: Path, text: str, rate: int) -> None:
    aiff = out.with_suffix(".aiff")
    subprocess.run(["say", "-v", VOICE, "-r", str(rate), "-o", str(aiff), text], check=True)
    subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(aiff),
                    "-ar", "16000", "-ac", "1", str(out)], check=True)
    aiff.unlink()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", help="오디오 저장 경로 (기본: 임시 폴더)")
    a = ap.parse_args()

    for tool in ("say", "ffmpeg"):
        if not shutil.which(tool):
            sys.exit(f"'{tool}' 이 없습니다. 이 셀프테스트는 macOS + ffmpeg 전제입니다.")

    d = Path(a.dir) if a.dir else Path(tempfile.mkdtemp(prefix="shadow_selftest_"))
    d.mkdir(parents=True, exist_ok=True)
    print(f"[selftest] audio dir: {d}")

    synth(d / "gt.wav", TEXT, 170)
    for name, _, rate, sub in CASES:
        if rate is None:
            shutil.copy(d / "gt.wav", d / f"{name}.wav")
        else:
            synth(d / f"{name}.wav", TEXT.replace(*sub) if sub else TEXT, rate)

    from scoring.shadow_score import score_shadowing  # 오디오 생성 뒤에 import (모델 로드 지연)

    fmt = lambda v: f"{v:.3f}" if isinstance(v, (int, float)) else "  -  "
    print(f"\n{'case':10s} {'설명':20s} {'status':6s} {'pron':>6s} {'rate':>6s} {'rhythm':>7s} "
          f"{'inton':>6s} {'stress':>7s}  {'sec':>4s}  top word_diff")
    R = {}
    for name, desc, _, _ in CASES:
        t = time.time()
        r = score_shadowing(d / "gt.wav", d / f"{name}.wav", TEXT)
        R[name] = r
        top = r["word_diff"][0] if r["word_diff"] else None
        top_s = f"{top['text']} ({top['note']})" if top else "-"
        print(f"{name:10s} {desc:20s} {r['status']:6s} {fmt(r['pronunciation_score']):>6s} "
              f"{fmt(r['rate_ratio']):>6s} {fmt(r['rhythm_score']):>7s} {fmt(r['intonation_score']):>6s} "
              f"{fmt(r['stress_match']):>7s}  {time.time()-t:4.1f}  {top_s}")

    def top_is(name, target):
        wd = R[name]["word_diff"]
        return bool(wd) and wd[0]["text"].rstrip(".,") == target and wd[0]["note"] == "발음 불명확"

    def no_pron_flag(name):
        return all(w["note"] != "발음 불명확" for w in R[name]["word_diff"])

    metrics = ("pronunciation_score", "rate_ratio", "rhythm_score", "intonation_score", "stress_match")
    base_pron = min(R["user_slow"]["pronunciation_score"], R["user_fast"]["pronunciation_score"])
    checks = [
        ("동일 파일: 다섯 지표 1.0", all(abs(R["user_same"][k] - 1.0) < 1e-3 for k in metrics)),
        ("느림: rate_ratio > 1", R["user_slow"]["rate_ratio"] > 1.0),
        ("빠름: rate_ratio < 1", R["user_fast"]["rate_ratio"] < 1.0),
        ("느림/빠름: 발음 오탐 없음", no_pron_flag("user_slow") and no_pron_flag("user_fast")),
        ("느림/빠름: pronunciation_score > 0.80", base_pron > 0.80),
        ("sub1: removing 이 발음 불명확 1위", top_is("user_sub1", "removing")),
        ("sub2: speaker's 가 발음 불명확 1위", top_is("user_sub2", "speaker's")),
        ("sub3: trained 가 발음 불명확 1위", top_is("user_sub3", "trained")),
        ("sub1~3: pronunciation_score < 느림/빠름",
         all(R[n]["pronunciation_score"] < base_pron for n in ("user_sub1", "user_sub2", "user_sub3"))),
        ("전부 status ok", all(r["status"] == "ok" for r in R.values())),
    ]
    print()
    ok = True
    for label, passed in checks:
        print(f"  [{'PASS' if passed else 'FAIL'}] {label}")
        ok &= passed

    for case, target in (("user_sub1", "removing"), ("user_slow", None)):
        print(f"\n--- {case} 단어별 pron ---")
        for w in R[case]["words"]:
            p = w["pron"]
            if p:
                mark = "  <--" if w["text"] == target else ""
                print(f"  {w['text']:12s} sim={p['sim']:.3f} gap={p['conf_gap']:+.3f} "
                      f"z={p['z']:+.2f} score={p['score']:.3f}{mark}")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
