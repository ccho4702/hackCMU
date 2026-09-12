# Local development

## 1. Install dependencies

Use **Python 3.12**, **Node.js 22+**, and FFmpeg. From the repository root:

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements.txt
backend/.venv/bin/python backend/scripts/download_model.py
cp -n backend/.env.example backend/.env
npm --prefix frontend ci
```

`cp -n` preserves an existing `.env`. FFmpeg can come from PATH or the included
`imageio-ffmpeg` dependency. The Face Landmarker download is stored in `backend/models/`.
MMS_FA downloads its weights on first initialization and reuses them afterward.

## 2. Configure the backend

Edit `backend/.env`:

```dotenv
GOOGLE_CLOUD_PROJECT=your-google-cloud-project
GOOGLE_CLOUD_LOCATION=global
GEMINI_AUTH_MODE=adc
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json

GEMINI_VIDEO_MODEL=gemini-3.8-flash
GEMINI_SCRIPT_MODEL=gemini-3.8-flash
ELEVENLABS_API_KEY=your-elevenlabs-key
ELEVENLABS_ASR_MODEL=scribe_v2
ELEVENLABS_TTS_MODEL=eleven_multilingual_v2

MONGODB_URI=your-mongodb-connection-string
MONGODB_DB=hackcmu
FACE_LANDMARKER_PATH=backend/models/face_landmarker.task
```

The model path above assumes you start the backend from the repository root.

- **Google Cloud:** enable the Vertex AI API and grant the service account access to
  the project. Keep the JSON’s project ID consistent with `GOOGLE_CLOUD_PROJECT`.
  `GOOGLE_SERVICE_ACCOUNT_JSON` also accepts the complete JSON inline in `.env`;
  choose one credential method. See [JSON authentication](../backend/README.md#google-cloud-authentication).
- **ElevenLabs:** use a key and plan with access to the required speech models and
  Instant Voice Cloning. Google Cloud and ElevenLabs billing are separate.
- **MongoDB:** required for the frontend’s name/email profile flow and saved history.
  The direct local coaching API can run without it. Profiles are a hackathon demo
  mechanism, not production identity verification.

Credentials, private recordings, generated speech, and voice caches are excluded from Git.
The public demo is versioned separately in `assets/demo.mp4`.
Keep provider credentials on the backend, outside `NEXT_PUBLIC_*` variables.

## 3. Start both servers

**Backend terminal**, from the repository root:

```bash
backend/.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

**Frontend terminal**, from the repository root:

```bash
npm --prefix frontend run dev -- --hostname 127.0.0.1 --port 3000
```

Open **http://127.0.0.1:3000**. API documentation: **http://127.0.0.1:8000/docs**.

Browser requests use relative `/api/...` URLs, including recording and live analysis.
Next.js forwards them to `BACKEND_URL`, which defaults to `http://localhost:8000`.
Leave `NEXT_PUBLIC_API_BASE_URL` unset for this setup. For another backend address,
set `BACKEND_URL` when starting Next.js; for production, set it at build and start.

If a port is already in use, check the existing server before starting another copy:

```bash
curl http://127.0.0.1:8000/api/health
```

Keep both terminals open. Stop a server with Ctrl+C. Restart the backend after changing
its `.env`. Camera and microphone access require localhost or HTTPS.


## Checks

```bash
backend/.venv/bin/python -m pytest backend/tests
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
```

Browser tests: `cd frontend && npx playwright install chromium --only-shell && npm run test:e2e`.
