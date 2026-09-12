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

```mermaid
flowchart LR
    classDef gemini fill:#e8f5ec,stroke:#1e8e3e,color:#0b3d1a
    classDef eleven fill:#fdf2f8,stroke:#db2777,color:#4a0b2e
    classDef user fill:#eef2ff,stroke:#4f6df5,color:#0f172a
    classDef crown fill:#fef3c7,stroke:#d97706,stroke-width:2px,color:#78350f

    L([🔑 Sign in]):::user --> V[📹 Live session<br/>MediaPipe feedback]:::user
    V --> A[🎥 Rehearsal video]
    A --> B[Gemini: visual + vocal analysis]:::gemini
    A --> D[Extract audio]
    D --> I[ElevenLabs ASR]:::eleven
    I --> C[Gemini: script revision]:::gemini
    C --> E[ElevenLabs voice clone + TTS]:::eleven
    D --> E
    B --> F[💬 Timestamped coaching]
    C --> G[📝 Improved script]
    E --> H[🔊 Practice audio]
    H --> P[🎙️ Practice trials]
    P --> S[📊 Five measures<br/>+ words to revisit]
    S --> K[👑 Leaderboard<br/>best take per recording]:::crown
    S -. next take .-> P
```

The normal flow makes **two Gemini generation requests**: one for visual and vocal delivery analysis
and one that improves the ElevenLabs transcript. ElevenLabs makes one ASR request
and one TTS request when a voice is cached; a new voice also needs one IVC creation request.
Video validation retries, when needed, add Gemini requests and are logged separately.

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
