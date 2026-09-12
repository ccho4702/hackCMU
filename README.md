<div align="center">

# 🏆 HackCMU 2026 Winner

### Mellonaires — Presentation analysis and practice.

**HackCMU 2026 우승 프로젝트 레포지토리**

Record yourself. See what to improve. Hear your next take.

![HackCMU](https://img.shields.io/badge/HackCMU-2026_Winner-FFC857?style=for-the-badge)
![Gemini](https://img.shields.io/badge/Google-Gemini-4285F4?style=for-the-badge)
![ElevenLabs](https://img.shields.io/badge/ElevenLabs-Voice_AI-111111?style=for-the-badge)

</div>

We built a presentation coach that turns one rehearsal recording into three useful
results: timestamped feedback on body language, a clearer presentation script, and
an audio reference that reads the improved script in the speaker's cloned voice.

## One recording. Three ways to improve.

| Result | What you get | Powered by |
| --- | --- | --- |
| **Delivery coaching** | Separate timestamped sections for nonverbal expression and vocal delivery | Gemini video understanding |
| **Script coaching** | Original transcript, concrete script issues, and a revised presentation script | ElevenLabs Scribe + Gemini |
| **Hear the improvement** | The revised script spoken with a cloned reference voice | ElevenLabs IVC + TTS |

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/pipeline-dark.png">
    <img src="docs/pipeline-light.png" alt="Pipeline: sign in, live session with MediaPipe feedback, rehearsal video, Gemini video analysis, audio to ElevenLabs Scribe and voice clone, Gemini script revision, ElevenLabs TTS, coaching / improved script / practice audio, practice trials, five measures, leaderboard" width="820">
  </picture>
</p>

The normal flow makes **two Gemini generation requests**: one for visual and vocal delivery analysis
and one that improves the ElevenLabs transcript. ElevenLabs makes one ASR request
and one TTS request when a voice is cached; a new voice also needs one IVC creation request.
Video validation retries, when needed, add Gemini requests and are logged separately.

## Facial delivery scores

You cannot optimize a vibe. `heuristic_v2` is the objective function: four 0–100
scalars a speaker can raise **in a specific second**. The maps are deterministic
(`backend/app/scoring/heuristic_v1.py`). Missing face/gaze/pose is `null`, never a fake 0.

**Unit — Sanchez-Lozano et al., IEEE TAFFC 2021.** Facial expression is local
Action Unit intensity (FACS 0–5), not an emotion class. MediaPipe blendshapes
are mapped onto AU channels and read as intensity / 5 (0–1). Blinks and eye-look
are excluded so they are not counted as “expressiveness.”

**Time — Kimani et al., ICMI 2020.** Audience ratings change over the talk, so
one whole-talk score is not actionable. We score every 1 s window (0.5 s stride).
Their positive gaze rule was ~80% time on the audience; we score
`0.70 × occupancy + 0.30 × residual drift`, with occupancy breakpoints centered
near 80%.

**What to measure — Dimitriadou & Lanitis, Multimedia Tools and Applications 2024.**
Lecture style is a set of measurable biometrics (facial expression, facial pose,
activity), reported both per frame and for the whole talk. That is our four axes:
AU-intensity velocity, AU range/diversity, head angular speed + jitter, gaze occupancy.

**Why a score at all — Ochoa & Domínguez, BJET 2020.** In a semester RCT,
automated presentation feedback improved the next talk when a human scored it
again. Timestamped alerts exist so the number is a practice target, not a label.

| Metric | Computation | Paper it implements |
| --- | --- | --- |
| Gaze | Share of the window with camera deviation ≤ 0.22, mixed with mean drift | Kimani et al. 2020 occupancy rule |
| Expression | L2 velocity of AU intensities; frozen low-intensity windows are capped | Sanchez-Lozano et al. 2021 intensity dynamics |
| Stability | Head angular speed (inverted-U) minus high-frequency jitter | Dimitriadou & Lanitis 2024 facial pose / activity |
| Expressiveness | Mean AU p90–p10 range + fraction of AUs that actually move | Sanchez-Lozano intensity + Dimitriadou expression range |

OpenOPAF (Ochoa & Zhao, *JLA* 2024) already feedbacks gaze and posture from
MediaPipe and notes facial expression as the underused channel. AU-intensity
scoring is that channel.

1. Sanchez-Lozano, E., Tzimiropoulos, G., Martinez, B., De la Torre, F., & Valstar, M. (2021). A transfer learning approach to heatmap regression for action unit intensity estimation. *IEEE Transactions on Affective Computing*. https://doi.org/10.1109/TAFFC.2021.3061605
2. Kimani, E., Murali, P., Shamekhi, A., Parmar, D., Munikoti, S., & Bickmore, T. (2020). Multimodal assessment of oral presentations using HMMs. *ICMI 2020*. https://doi.org/10.1145/3382507.3418888
3. Dimitriadou, E., & Lanitis, A. (2024). An integrated framework for developing and evaluating a lecture style assessment methodology. *Multimedia Tools and Applications*. https://doi.org/10.1007/s11042-024-20297-6
4. Ochoa, X., & Domínguez, F. (2020). Controlled evaluation of a multimodal system to improve oral presentation skills in a real learning setting. *British Journal of Educational Technology, 51*(5), 1615–1630. https://doi.org/10.1111/bjet.12987

## Built with

| Layer | Technology |
| --- | --- |
| Frontend | Next.js, React, Tailwind CSS |
| Backend | FastAPI, Python 3.12 |
| Video and script analysis | Google Cloud Gemini 3.8 Flash |
| Transcription, voice, and speech | ElevenLabs Scribe v2, Instant Voice Cloning, Multilingual v2 |
| Media processing | FFmpeg |

## Run locally

Run the backend and frontend in **two separate terminals** and keep both open.
The commands below assume dependencies and `backend/.env` are already set up.

**Terminal 1 — backend** (from the repository root):

```bash
backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

**Terminal 2 — frontend** (from the repository root):

```bash
# Uses the bundled Node installation when available; otherwise uses Node on PATH.
export PATH="$PWD/.tools/node/bin:$PATH"
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open **http://localhost:3000**. API docs: **http://localhost:8000/docs**.
If you see `Address already in use`, a process is already listening on that port.
Check `curl http://localhost:8000/api/health` and open the frontend before starting
another copy. Stop a server with Ctrl+C in its terminal. Restart the backend after
changing its `.env`; the commands above do not enable automatic reload.

### First-time setup

Use Python 3.12 and Node.js 22 or newer. From the repository root:

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python backend/scripts/download_model.py
cp -n backend/.env.example backend/.env
export PATH="$PWD/.tools/node/bin:$PATH"
(cd frontend && npm ci)
```

`cp -n` preserves an existing `.env`. Configure the values below before starting
the backend. Install the Face Landmarker asset for MediaPipe as described in the
backend configuration; FFmpeg is resolved from PATH or `imageio-ffmpeg`.

### Google Cloud JSON authentication

Put the complete service-account JSON on **one line**, enclosed in single quotes,
in `backend/.env` alongside the ElevenLabs key:

```dotenv
GOOGLE_CLOUD_PROJECT=your-existing-cloud-project-id
GOOGLE_CLOUD_LOCATION=global
GEMINI_AUTH_MODE=adc
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-existing-cloud-project-id","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"backend@your-existing-cloud-project-id.iam.gserviceaccount.com","token_uri":"https://oauth2.googleapis.com/token"}'
ELEVENLABS_API_KEY=your-elevenlabs-key
```

Replace the abbreviated JSON with the complete credentials; keep the literal `\n`
escapes inside `private_key`. With this variable set, the backend authenticates as
the service account without `gcloud auth application-default login` or a separate
JSON file. The account needs `aiplatform.endpoints.predict` and
`serviceusage.services.use` on the project, with the Vertex AI API enabled.
The project's ID must match the JSON's `project_id`.

Gemini still calls **Google Cloud Vertex AI**, using the project's linked billing
account and eligible remaining trial credits. This configuration does not upgrade
the billing account. AI Studio Gemini Developer API usage is excluded from the
$300 Welcome credit program. See [Google's Free Trial coverage](https://docs.cloud.google.com/free/docs/free-cloud-features).
ElevenLabs has separate billing and needs Instant Voice Cloning access.

Share `.env` privately with authorized teammates; **never commit it or put these
credentials in frontend code or `NEXT_PUBLIC_*` variables**. Real secrets are not
included in this repository. A small authentication check is available:

```bash
backend/.venv/bin/python -m backend.experiments.check_gemini
```

This sends one Gemini generation request. See the [backend guide](backend/README.md)
for file-based credentials and optional MongoDB configuration.

Choose **Start Live Analysis** to capture camera and microphone with live MediaPipe
metrics. **Stop session** opens the original analysis workspace and starts the script/voice
pipeline. Use **Open evaluation** for the revised script, TTS, and voice practice.
**Analyze Recorded Video** follows the same two-part flow with an uploaded file.
The browser uploads the recording and follows progress until the original video, delivery
notes, original/revised script tabs, and generated audio are ready. Existing recordings
can also be uploaded. Camera capture requires localhost or HTTPS. Recordings stop
automatically at 90 seconds. The last run restores on reload; `/evaluation?run=<run_id>` opens a saved run.

## Try the pipeline

```bash
curl -X POST http://localhost:8000/api/pipeline \
  -F 'file=@/path/to/your-recording.mov' \
  -F 'user_id=demo-user'
```

The response contains a run ID and URLs for the feedback JSON, revised script, and
generated MP3. The upload returns **202 Accepted** with a run ID; poll
`GET /api/runs/{run_id}` for progress, partial results, and final output URLs.
Individual stages can also be called independently. See the [backend guide](backend/README.md).

## Repository map

```text
backend/
  gemini_video/       Visual/vocal analysis, validation, retries, attempt logs
  gemini_script/      Text-based script feedback and revision
  elevenlabs_asr/     Original speech transcription with Scribe v2
  elevenlabs_tts/     Audio extraction, voice cache, cloned-voice TTS
  pipeline/          Orchestrates the three stages
  common/            Configuration, media utilities, artifact logging
  tests/             API, retry, validation, cache, and pipeline checks
  experiments/       Earlier Gemini TTS and voice-replication experiments
  artifacts/         Local recordings/results; excluded from Git
frontend/            Next.js frontend
docs/                Development notes
```

Each run has its own `inputs/`, `intermediates/`, `outputs/`, and `logs/` directories.
Recordings, credentials, generated audio, and local voice caches stay out of Git.

## Verify

```bash
backend/.venv/bin/pytest -c backend/pytest.ini backend/tests
```

Browser checks: `cd frontend && npm run test:e2e` (run `npx playwright install chromium --only-shell` once).
The tests simulate recording without accessing a real camera and mock paid provider requests.
Set `REAL_RUN_ID` to also inspect an already-generated result without new generation calls.

Generated coaching and speech remain model
outputs to review and rehearse with; they are not guarantees of perfect delivery.

## Practice the next take

Once the reference audio is ready, choose **Practice this script**. The voice-practice
page keeps the script and reference together, highlights each word during playback,
and offers microphone-only recording for repeated trials. Each take is compared with
the same TTS reference using the scoring module contributed on `gmin`.

See five separate measures—pronunciation, pace, rhythm, intonation, and emphasis—plus
words to revisit. Replay a trial to follow its own word timing. Unreliable alignment
produces a retry message instead of a score. The guided recording highlight follows
reference timing; it does not claim to recognize speech live.

New TTS responses include timing in the same ElevenLabs request. Earlier recordings
can prepare timing once and reuse it. Scoring is local and requires an initial ~1.2GB
model download. See the [backend guide](backend/README.md#voice-practice-and-word-timing).


## Frontend flow

The frontend follows the latest `main` Mellonaires workspace (`8b5abfd`), preserving
recorded/live MediaPipe analysis, face mesh, timelines, segment inspection, and exports.
The additional Evaluation and Voice Practice panels share its neutral design tokens.

- `/`: main's recorded/live mode selection.
- `/live`: camera + microphone, real MediaPipe analysis, then recorded review.
- `/analysis/<analysisId>`: main's analysis workspace with a Script & Voice bridge.
- `/evaluation?run=<run_id>`: Gemini feedback, original/revised script, and TTS.
- `/practice?run=<run_id>`: repeated voice trials and word-level timing.
- `/streaming`: retained legacy Live Session UI.

The active word shows its start/end timestamps, target duration, remaining time, and
progress bar. Reference playback and recorded-trial playback use their respective times.
See [the imported MediaPipe guide](docs/mediapipe-main.md) for the original instrumentation
architecture, and [the unified backend guide](backend/README.md) for the combined API.
