# Mellonaires — Presentation Delivery Analysis

Instrumentation system for **quantitative analysis of a speaker's observable facial delivery** from an uploaded presentation video.

It measures landmarks, head geometry, approximate camera-oriented gaze, blendshape activity, and temporal movement. It is **not** an emotion, personality, confidence, honesty, or coaching product.

Stack:

- Frontend: Next.js (App Router) + React + TypeScript + Tailwind CSS
- Backend: FastAPI + MediaPipe Face Landmarker
- Contract: versioned JSON under `/api/v1`

## Local development

Requires Python 3.11+ and Node 20+. FFmpeg is recommended so OpenCV can decode common MP4/MOV/WebM files.

```bash
# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python scripts/download_model.py
cp .env.example .env
uvicorn app.main:app --reload --port 8000

# Frontend (second terminal)
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API docs: [http://localhost:8000/docs](http://localhost:8000/docs).

`make install`, `make download-model`, `make backend`, and `make frontend` wrap the same commands.

### Mock analyzer

For UI work without MediaPipe, set `ANALYZER=mock` in `backend/.env`. Mock mode is labeled in the UI and in result provenance. The backend never silently falls back to mock when MediaPipe fails.

## Architecture

```
Browser  →  Next.js workspace  →  FastAPI /api/v1
                                   ├── validate / decode
                                   ├── sample ~12 fps
                                   ├── MediaPipe Face Landmarker
                                   ├── features / windows / scores
                                   └── AnalysisResult JSON
```

The frontend plays the **original local file** (`URL.createObjectURL`) and overlays stored landmarks. After analysis completes, playback does not call the API per frame. Live mode sends JPEG camera frames to the same scoring pipeline at ~12 fps and can be reviewed as a standard `AnalysisResult` after stop.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/analyses` | multipart upload (`video`, optional `analysisConfig`, `thresholdConfig`) |
| `GET` | `/api/v1/analyses/{id}` / `.../status` | job progress |
| `GET` | `/api/v1/analyses/{id}/events` | SSE progress |
| `GET` | `/api/v1/analyses/{id}/result` | `AnalysisResult` (`includeFrames`) |
| `GET` | `/api/v1/analyses/{id}/windows` | window metrics |
| `GET` | `/api/v1/analyses/{id}/frames` | `startMs` / `endMs` |
| `GET` | `/api/v1/analyses/{id}/export/json` | canonical JSON |
| `GET` | `/api/v1/analyses/{id}/export/csv` | window CSV |
| `DELETE` | `/api/v1/analyses/{id}` | cancel + delete temp files |
| `POST` | `/api/v1/live/sessions` | start a webcam analysis session |
| `POST` | `/api/v1/live/sessions/{id}/frames` | JPEG frame + `timestampMs` → live tick |
| `POST` | `/api/v1/live/sessions/{id}/stop` | finalize into `AnalysisResult` |
| `GET` | `/api/v1/health` | liveness |

JSON uses camelCase. FastAPI OpenAPI (`/openapi.json`) is the source of truth. Generate TypeScript with:

```bash
cd frontend
npm run generate:api
```

(requires the backend to be running)

## Scoring

`heuristic_v1` maps window features through documented piecewise-linear curves. Valid scores are `0–100`. Missing face/gaze/pose never becomes `0`; it is `null` and shown as unavailable in the UI.

Head-pose sign convention (stable in exports):

- **Yaw+**: speaker turns left (nose toward camera +X)
- **Pitch+**: speaker looks up
- **Roll+**: tilt toward the speaker's right shoulder

Gaze is approximate visual orientation toward the camera, not calibrated eye tracking. Blink frames are invalid, not penalized.

Delivery warnings are derived from **windowed scores** with persistence and hysteresis (`alertEnterMs`, `alertExitMs`, `alertHysteresis`). They are stored on `AnalysisResult.alerts` and drive regional Face Mesh highlights. Copy describes observable presentation behavior only.

## Tests

```bash
cd backend && .venv/bin/pytest
cd frontend && npm test
```

A MediaPipe smoke test runs when `models/face_landmarker.task` is present.

MediaPipe is pinned to **0.10.35**. Version 1.0.x currently aborts on macOS during Face Landmarker graph setup (`DrishtiMetalHelper` / GPU graph service). Do not silently upgrade past 0.10.35 without re-testing Face Landmarker initialization.

## Temporary storage

Uploads live under `TEMP_STORAGE_PATH` (default `/tmp/mellonaires/{analysisId}/`). Files are removed on `DELETE`. The repository abstraction can later be replaced with S3/Postgres without changing MediaPipe or scoring modules.

## Docker

`docker compose up` is provided for convenience. MediaPipe wheels can be awkward on some platforms; local venv is the supported demo path.
