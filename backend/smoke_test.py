"""
API 스모크 테스트. 서버를 따로 띄우지 않고 TestClient 로 전체 흐름을 돈다.

    로그인 → reference 생성 → 문장별 쉐도잉 업로드(즉시 채점) → 전체 녹음 shadow trial(백그라운드 채점)
    → original trial → 목록 + best → 미디어 서빙 → 삭제 → 인증 가드

오디오는 macOS `say` 로 만든다. 실제 Atlas DB 에 쓰고 끝나면 지운다 (--keep 이면 남긴다).
응답 예시를 examples/*.json 에 남긴다. 프론트가 응답 모양을 볼 때 이걸 보면 된다.

    cd backend
    python smoke_test.py [--keep]
"""
import argparse
import json
import subprocess
import tempfile
import time
from pathlib import Path

QUESTION = "Tell me about a project you're proud of."
SCRIPT = [
    ("s0", "The project I'm most proud of is a speaker unlearning system for text-to-speech models."),
    ("s1", "The challenge was removing a speaker's voice from a trained model without retraining it from scratch."),
    ("s2", "I designed a training-free method, and it cut the speaker similarity by sixty percent while keeping audio quality intact."),
]
EMAIL = "smoke@test.local"


def say(path: Path, text: str, rate: int = 170, voice: str = "Samantha") -> Path:
    aiff = path.with_suffix(".aiff")
    subprocess.run(["say", "-v", voice, "-r", str(rate), "-o", str(aiff), text], check=True)
    try:
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(aiff), str(path)], check=True)
    except subprocess.CalledProcessError:
        path = path.with_suffix(".wav")   # mp3 인코더 없는 ffmpeg 폴백
        subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", str(aiff), str(path)], check=True)
    aiff.unlink()
    return path


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--keep", action="store_true", help="테스트 데이터를 DB 와 data/ 에 남긴다")
    a = ap.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="smoke_"))
    ex = Path("examples")
    ex.mkdir(exist_ok=True)

    def dump(name, obj):
        (ex / f"{name}.json").write_text(json.dumps(obj, ensure_ascii=False, indent=2))

    from fastapi.testclient import TestClient
    from main import app

    with TestClient(app) as c:
        # 1. 로그인
        r = c.post("/api/auth/login", json={"name": "Smoke Tester", "email": EMAIL})
        assert r.status_code == 200, r.text
        user = r.json()
        H = {"X-User-Id": user["user_id"]}
        dump("login", user)
        print("login       ", user["user_id"])

        # 2. reference (TTS 모듈이 올리는 것과 같은 형태)
        files = []
        for sid, text in SCRIPT:
            p = say(tmp / f"ref_{sid}.mp3", text, 170)
            files.append(("audio", (p.name, p.open("rb"), "audio/mpeg")))
        r = c.post("/api/references", headers=H, files=files, data={
            "question": QUESTION, "voice_id": "test_voice",
            "script": json.dumps([{"id": s, "text": t} for s, t in SCRIPT]),
        })
        assert r.status_code == 200, r.text
        ref = r.json()
        dump("reference", ref)
        print("reference   ", ref["id"], "durations", [s["duration_sec"] for s in ref["script"]])

        # 3. shadow trial, 문장별 업로드 (쉐도잉 카드 흐름). s2 는 sixty→fifty 로 바꿔 읽음
        r = c.post("/api/trials", headers=H, data={"question": QUESTION, "kind": "shadow", "reference_id": ref["id"]})
        assert r.status_code == 200, r.text
        t1 = r.json()
        print("trial A     ", t1["id"], "(문장별)", t1["status"])
        variants = {"s0": (150, None), "s1": (150, None), "s2": (150, ("sixty", "fifty"))}
        for sid, text in SCRIPT:
            rate, sub = variants[sid]
            p = say(tmp / f"u1_{sid}.wav", text.replace(*sub) if sub else text, rate)
            t = time.time()
            r = c.post(f"/api/trials/{t1['id']}/sentences/{sid}", headers=H,
                       files={"file": (p.name, p.open("rb"), "audio/wav")})
            assert r.status_code == 200, r.text
            s = r.json()
            wd = s["sentence"]["word_diff"]
            top = f"{wd[0]['text']} ({wd[0]['note']})" if wd else "-"
            print(f"   {sid}: pron={s['sentence']['pronunciation_score']}  rate={s['sentence']['rate_ratio']}  "
                  f"overall→{s['summary']['overall']}  top={top}  {time.time()-t:.1f}s")
            if sid == "s2":
                dump("sentence_upload", s)
                if not (wd and wd[0]["text"] == "sixty"):
                    print("   WARN: sixty→fifty 가 word_diff 1위가 아님")

        # 4. shadow trial, 전체 녹음 한 번에 (백그라운드에서 문장으로 잘라 채점)
        p = say(tmp / "u2_full.wav", " ".join(t for _, t in SCRIPT), 190)
        r = c.post("/api/trials", headers=H,
                   data={"question": QUESTION, "kind": "shadow", "reference_id": ref["id"]},
                   files={"file": ("raw.wav", p.open("rb"), "audio/wav")})
        assert r.status_code == 200, r.text
        t2 = c.get(f"/api/trials/{r.json()['id']}", headers=H).json()   # TestClient 는 background task 를 응답 전에 끝낸다
        dump("trial_full", t2)
        print("trial B     ", t2["id"], "(전체녹음)", t2["status"], t2.get("error") or "",
              "overall=", (t2["summary"] or {}).get("overall"))
        assert t2["status"] == "ready", t2.get("error")
        for s in t2["shadowing"]:
            print(f"   {s['sentence_id']}: {s['status']}  seg={s.get('segment')}  pron={s.get('pronunciation_score')}  rate={s.get('rate_ratio')}")

        # 5. original trial (reference 없음 → 쉐도잉 점수 없음, 팀원 모듈 자리만)
        p = say(tmp / "u3_orig.wav", "Um, so the project I'm proud of is like a speaker unlearning thing.", 170)
        r = c.post("/api/trials", headers=H, data={"question": QUESTION, "kind": "original"},
                   files={"file": ("raw.wav", p.open("rb"), "audio/wav")})
        assert r.status_code == 200, r.text
        t3 = c.get(f"/api/trials/{r.json()['id']}", headers=H).json()
        print("trial C     ", t3["id"], "(original)", t3["status"], "dur=", t3["media"]["duration_sec"], "summary=", t3["summary"])
        assert t3["status"] == "ready" and t3["summary"] is None

        # 6. 목록 + best
        L = c.get("/api/trials", headers=H, params={"question": QUESTION}).json()
        dump("trial_list", L)
        print("list        ", [(x["id"][-4:], x["kind"], (x["summary"] or {}).get("overall"), "BEST" if x["best"] else "") for x in L["trials"]])
        assert L["best_trial_id"] in (t1["id"], t2["id"])
        assert sum(x["best"] for x in L["trials"]) == 1

        # 7. 미디어 서빙
        r = c.get(t3["media"]["wav_url"])
        assert r.status_code == 200 and len(r.content) > 1000
        print("media       ", t3["media"]["wav_url"], len(r.content), "bytes")

        # 8. 삭제
        assert c.delete(f"/api/trials/{t3['id']}", headers=H).status_code == 200
        assert c.get(f"/api/trials/{t3['id']}", headers=H).status_code == 404
        print("delete      ok")

        # 9. 인증 가드
        assert c.get("/api/trials", headers={"X-User-Id": "000000000000000000000000"}).status_code == 401
        assert c.get("/api/trials").status_code == 422
        print("auth guard  ok")

        if a.keep:
            print("kept        user", user["user_id"], "(DB 와 data/ 에 남김)")
        else:
            import db
            import media
            db.trials().delete_many({"user_id": user["user_id"]})
            db.references().delete_many({"user_id": user["user_id"]})
            db.users().delete_one({"email": EMAIL})
            media.remove_dir(user["user_id"])
            print("cleanup     ok")

    print("\nSMOKE OK  (examples/*.json 갱신됨)")


if __name__ == "__main__":
    main()
