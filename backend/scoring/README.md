# scoring — 쉐도잉 점수

GT 문장 오디오(본인 클론 보이스로 만든 개선본)와 사용자가 따라 읽은 오디오, 그 문장 텍스트를 받아
**발음·속도·리듬·억양·강세** 다섯 지표와 **단어별 편차**를 낸다.

GT가 본인 목소리라는 전제라 음색은 통제돼 있고, 남는 차이는 발음과 운율이다.
ElevenLabs, Gemini와 무관하다. 오디오가 어디서 왔는지 모른다. 그래서 클로닝 쪽이 막혀 있어도 이 모듈은 독립적으로 굴러간다.

## 사용

```python
from scoring.shadow_score import score_shadowing, warmup

warmup()   # 서버 시작 시 한 번. 모델 로드를 첫 요청에서 하지 않게
r = score_shadowing("gt.wav", "user.wav", "The challenge was removing a speaker's voice.")
r["pronunciation_score"], r["rate_ratio"], r["rhythm_score"], r["intonation_score"], r["stress_match"]
r["word_diff"]   # 프론트가 실제로 강조하는 것
```

ElevenLabs `with-timestamps` 응답을 단어로 접은 게 있으면 넘긴다. GT 단어 구간을 그걸로 덮어써서 프론트 하이라이트와 일치시킨다.

```python
r = score_shadowing("gt.wav", "user.wav", text, gt_words=[{"text": "The", "t0": 0.0, "t1": 0.14}, ...])
```

CLI:

```bash
cd backend
python -m scoring.shadow_score gt.wav user.wav "The challenge was removing a speaker's voice." --compact
python -m scoring.selftest        # 환경 검증. macOS + ffmpeg 필요, API 키 불필요
```

## 출력

| 필드 | 뜻 |
|---|---|
| `status` | `ok` / `unreliable`. unreliable이면 프론트는 점수를 숨기고 "다시 읽어주세요" |
| `pronunciation_score` | 0~1. 가장 약한 단어 3개의 발음 점수 평균. 문장은 가장 약한 단어만큼 또렷하다 |
| `rate_ratio` | 사용자 발화 길이 ÷ GT. 1.0이 일치, 앞뒤 무음 제외 |
| `rhythm_score` | 0~1. 전체 속도를 뺀 뒤 단어별 지속시간 비율이 GT와 얼마나 같은가 |
| `intonation_score` | 0~1. 세미톤·중앙값 정규화한 F0 곡선의 DTW 거리 |
| `stress_match` | 0~1. 단어별 prominence(에너지+F0 피크) 순위 상관 |
| `word_diff[]` | 편차 큰 단어 상위 3개. `note`는 발음 불명확 / 급하게 지나감 / 늘어짐 / 강세 빠짐 / 강세 과함 |
| `words[]` | 전 단어의 양쪽 `t0, t1, score, prominence`와 `pron`. 프론트가 파형 위에 그린다 |
| `align_confidence` | 정렬 평균 신뢰도. `gt_source`가 `external`이면 ElevenLabs 타임스탬프를 쓴 것 |

## 어떻게 계산하나

1. **정렬** — torchaudio `forced_align` + `MMS_FA`. 텍스트를 아니까 단어 경계가 나온다. 천 개 넘는 언어로 학습된 모델이라 비원어민 억양에 강하다. 가중치 1.2GB, 첫 실행 때 한 번 받는다.
2. **발음** — 정렬 모델의 부산물 두 개를 합친다. 추가 모델 없음.
   - `sim`: 마지막 transformer 층 특징을 단어 구간에서 평균 낸 벡터의 GT-사용자 코사인 유사도. 같은 목소리라 "이 단어가 기준과 얼마나 다르게 들리나"가 남는다.
   - `conf_gap`: 정렬 신뢰도(기대한 글자들이 얼마나 또렷이 들렸나)가 GT보다 얼마나 떨어졌나.
   - `z`: sim의 문장 내 z-score. 마이크·환경 차이로 sim이 전체적으로 낮아져도 "어느 단어"는 잡힌다.
3. **운율** — librosa pYIN으로 F0, RMS로 에너지. 10ms 프레임.
4. **지표** — 전부 결정적 수식. 학습 없음. 상수는 파일 상단에 모여 있고 실제 부스 녹음으로 재조정 대상이다.

발음 신호가 실제로 "틀린 단어"를 잡는지는 층별로 실험해서 정했다. 같은 목소리로 단어 하나만 바꿔 읽은 오디오 세 개에서, 바꾼 단어가 마지막 층 코사인에서 세 번 모두 최하위(z ≈ −3.5 ~ −3.9)였고, 같은 목소리로 속도만 바꾼 경우는 최저 0.96이라 갈린다.

## 붙일 때 알아둘 것

- **서버 시작 시 `warmup()`.** 모델 로드가 수십 초라 첫 요청에서 하면 타임아웃 난다.
- **문장당 3~4초(CPU), 직렬.** 인코딩이 lock으로 직렬화돼 있어 답변 5문장이면 20초쯤. 필요하면 프로세스를 나눈다.
- **스크립트의 숫자는 글자로.** 정렬 모델 사전에 숫자가 없다. "60%"가 아니라 "sixty percent". Gemini 프롬프트에 넣을 것.
- **입력은 wav.** mp3도 로드는 되지만 ingest에서 16k mono wav로 맞춰 오는 게 전제.
- **같은 문장을 읽는다는 전제.** 단어를 빼먹거나 다른 말을 하면 `status: unreliable`로 떨어진다.
- **발음 점수의 절대값은 아직 보정 전이다.** 지금 상수는 TTS 대 TTS로 잡은 것이라, 실제 마이크 녹음 대 클론 TTS에서는 `sim`이 전체적으로 낮게 나올 수 있다. "어느 단어"는 z-score라 유지되지만, 문장 점수 절대값은 첫 실녹음으로 `PRON_SIM_FLOOR`를 다시 잡아야 한다.
- 점수 하나로 합치지 말 것. 다섯 축을 따로 보여주고 `word_diff`를 강조하는 게 설명 가능하고 방어 가능하다.

## 셀프테스트 결과 (참고)

macOS `say`의 같은 목소리로 만든 입력. GT가 본인 클론 보이스라는 실제 조건과 같게 목소리는 안 바꾸고, 속도를 바꾸거나 단어 하나를 바꿔 읽었다.

| case | pron | rate | rhythm | inton | stress | word_diff 1위 |
|---|---|---|---|---|---|---|
| 동일 파일 | 1.000 | 1.000 | 1.000 | 1.000 | 1.000 | - |
| 느리게 | 0.900 | 1.104 | 0.838 | 0.968 | 0.957 | - |
| 빠르게 | 0.891 | 0.893 | 0.782 | 0.960 | 0.963 | trained (강세 빠짐) |
| removing→renewing | 0.730 | 0.998 | 0.924 | 0.965 | 0.974 | removing (발음 불명확) |
| speaker's→seeker's | 0.858 | 0.993 | 0.942 | 0.984 | 0.965 | speaker's (발음 불명확) |
| trained→drained | 0.854 | 0.993 | 0.852 | 0.974 | 0.975 | trained (발음 불명확) |

바꿔 읽은 단어는 세 번 모두 `word_diff` 1위에 "발음 불명확"으로 올라오고, 속도만 바꾼 경우는 발음 오탐이 없다.
음소 하나만 다른 경우(seeker's, drained)는 두 음절이 다른 경우(renewing)보다 점수 하락이 작다. 차이의 크기가 점수에 반영된다는 뜻이다.
