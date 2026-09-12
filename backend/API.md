# Backend API

FastAPI, 모든 경로는 `/api` 아래. Next.js rewrite 로 프론트에서는 같은 origin 으로 보인다.
응답 예시는 `examples/*.json` 에 있다 (스모크 테스트가 실제 응답을 떨군 것).

```bash
cd backend
pip install -r requirements.txt
fastapi dev main.py          # http://localhost:8000/docs 에서 직접 눌러볼 수 있다
python smoke_test.py         # 전체 흐름 검증. macOS + ffmpeg 필요
```

## 인증 (가짜 로그인)

```
POST /api/auth/login   {"name": "...", "email": "..."}   →  {"user_id", "name", "email"}
```

비밀번호 없음. 이메일로 upsert. 이후 **모든 요청에 `X-User-Id: <user_id>` 헤더**를 붙인다.
없거나 틀리면 401. 프론트는 localStorage 에 user_id 만 들고 있으면 된다. 예시: `examples/login.json`

## reference (개선본)

질문 하나에 대한 개선 스크립트 + 문장별 TTS. 쉐도잉 trial 의 채점 기준. TTS 모듈이 만든다.

```
POST /api/references            multipart
    question   str
    voice_id   str (선택)
    script     JSON 문자열  [{"id":"s0","text":"...","words":[{text,t0,t1}]|null}, ...]
    audio      파일 여러 개, script 순서대로 (ElevenLabs mp3 그대로)
GET  /api/references?question=  →  {"references": [...]}
GET  /api/references/{id}
```

응답의 `script[].audio_url` 이 재생용 주소. 예시: `examples/reference.json`
`words` 는 ElevenLabs with-timestamps 응답을 단어로 접은 것. 있으면 채점 때 GT 단어 구간으로 쓴다.
스크립트의 숫자는 글자로 풀어 쓴다 ("60%" 말고 "sixty percent"). 정렬 모델 사전에 숫자가 없다.

## trial (녹화 한 번)

```
POST   /api/trials                            multipart
    question      str
    kind          "original" | "shadow"   (기본 original)
    reference_id  str  (shadow 면 필수)
    file          녹화 파일 (선택. webm/wav/mp3 아무거나, ffmpeg 가 변환)
GET    /api/trials?question=&kind=&limit=     →  {"trials": [...], "best_trial_id"}
GET    /api/trials/{id}
DELETE /api/trials/{id}
POST   /api/trials/{id}/sentences/{sid}       multipart  file  →  {"sentence": {...}, "summary": {...}}
```

### 두 가지 흐름

**(a) 전체 답변을 한 번에 녹음.** `POST /api/trials` 에 `file` 을 넣는다. 응답은 `status: "processing"` 으로 즉시 오고,
백그라운드에서 wav 변환 → (팀원 모듈: STT, MediaPipe) → reference 가 있으면 녹음을 문장별로 잘라 채점 → `status: "ready"`.
프론트는 `GET /api/trials/{id}` 를 폴링해서 `status` 가 `ready` 나 `error` 가 될 때까지 기다린다. 예시: `examples/trial_full.json`

**(b) 쉐도잉 카드에서 문장별 녹음.** `POST /api/trials` 를 `file` 없이 `kind=shadow`, `reference_id` 로 만들고,
문장 녹음이 끝날 때마다 `POST /api/trials/{id}/sentences/{sid}` 에 올린다. **요청 안에서 채점하고(3~5초) 그 문장 결과와
갱신된 summary 를 바로 돌려준다.** 같은 문장을 다시 올리면 덮어쓴다. 예시: `examples/sentence_upload.json`

### 문서 모양

```
id, user_id, question, kind, reference_id, created_at
status        "processing" | "ready" | "error"
error         null | {code, message}
media         {raw, wav, duration_sec, raw_url, wav_url}
metrics       {language: null, nonverbal: null}        ← 팀원 모듈이 채우는 자리 (STT, MediaPipe)
shadowing[]   문장별 채점. {sentence_id, text, segment|null, wav_url, status, pronunciation_score,
              rate_ratio, rhythm_score, intonation_score, stress_match, word_diff[], words[], ...}
              (필드 뜻은 scoring/README.md)
summary       null | {axes: {pronunciation, rate, rhythm, intonation, stress}, overall, n_scored, n_sentences}
```

목록(`GET /api/trials`)은 `shadowing` 과 `metrics` 를 뺀 요약만 준다. 예시: `examples/trial_list.json`

### best trial

`summary.overall` 이 가장 높은 trial. 목록 응답의 `best_trial_id` 와 각 항목의 `best: true` 로 온다.
`?question=` 을 주면 그 질문 안에서, 안 주면 내 전체 trial 중에서 고른다.

`overall` 은 다섯 축의 **가중치 없는 평균**이다. 정렬과 배지에만 쓰고 화면에는 다섯 축을 따로 보여주는 게 원칙이다.
`rate` 축은 `1 - |1 - rate_ratio|` 로 뒤집어서 1.0 이 "GT 와 같은 속도" 가 되게 했다. 오디오 점수만 본다.
언어·비언어 지표(`metrics`)는 best 판정에 안 들어간다.

## 미디어

Mongo 에는 경로만 저장하고 파일은 `backend/data/{user_id}/...` 에 둔다 (gitignore 됨).
응답의 `*_url` (`/api/media/...`) 을 `<audio src>` 에 그대로 넣으면 된다.

## 에러

FastAPI 관례대로 `{"detail": "..."}`. 400 입력 오류, 401 인증, 404 없음, 500 채점 실패.
백그라운드 채점이 실패하면 trial 의 `status: "error"`, `error.code: "PIPELINE_FAILED"`.

## 팀원 모듈이 붙는 자리

`routers/trials.py` 의 `process_full_recording()` 안에 주석으로 표시해 뒀다. wav 경로(오디오)와 raw 경로(영상)를 받아
`metrics.language`, `metrics.nonverbal` 을 채우면 된다. reference 생성은 TTS 모듈이 `POST /api/references` 를 호출하거나
`db.references().insert_one()` 을 직접 써도 된다 (문서 모양은 `db.py` 상단).
