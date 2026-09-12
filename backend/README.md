# Backend

Independent provider modules, composed by `pipeline/`:

1. `gemini_video`: nonverbal observations and actionable corrections only. Output is
   an array of `{start_time, end_time, content}` with `MM:SS.sss` times. Includes schema,
   local validation, bounded retries, raw responses, and cumulative usage logs.
2. `elevenlabs_asr`: extracted recording audio -> verbatim text with Scribe v2.
   Stores the original transcript and word timestamps before revision.
3. `gemini_script`: ASR text -> script issues + revised script in one Gemini call.
   Visual delivery is excluded. The rewritten script retains the original language.
   The legacy direct-video endpoint remains available independently.
4. `elevenlabs_tts`: reference recording -> cached IVC voice -> revised-script MP3.
   Based on the supplied hackathon pipeline; `labels={}` is preserved. API keys are
   read lazily so Gemini-only routes work without ElevenLabs credentials.

## API

Run from the repository root with `uvicorn backend.main:app --reload`.

| Endpoint | Input | Output |
| --- | --- | --- |
| `POST /api/pipeline` | Multipart `file`, `user_id`, optional `noisy_environment` | 202 Accepted, run ID, status URL |
| `POST /api/video/analyze` | Multipart video `file` | Nonverbal feedback array; `X-Run-ID` header |
| `POST /api/script/analyze-video` | Multipart video `file` | `original_script`, `issues`, `improved_script`; `X-Run-ID` |
| `POST /api/script/analyze` | JSON `{ "script": "..." }` | Same script response shape |
| `POST /api/asr/transcribe` | Multipart recording `file` | Original transcript and word timestamps |
| `POST /api/tts/generate` | Multipart `file`, `user_id`, `improved_script`, optional `noisy_environment` | MP3; `X-Run-ID` |
| `GET /api/runs/{run_id}` | Pipeline run ID | Status, stage, partial/final results, output URLs |
| `GET /api/runs/{run_id}/original` | Run ID | Browser-compatible original recording preview |
| `GET /api/runs/{run_id}/outputs/{filename}` | Run ID and allowed result filename | Result file |
| `GET /api/health` | — | Health check |

Existing `/api/echo` and `/api/upload` starter routes are retained for compatibility.
`/api/upload` only describes an upload; use `/api/pipeline` for processing.

The pipeline sends video to Gemini once for nonverbal analysis. Separately, audio
is sent to ElevenLabs ASR, and its text is sent to Gemini for script revision.
The generated `improved_script` is passed directly to ElevenLabs TTS. The extracted
audio sample is reused for voice cloning. ASR names and technical terms may be
incorrect, so the original transcript is always shown beside the revision.

## Artifact layout

```text
artifacts/
  runs/<run_id>/
    inputs/recording.mov
    intermediates/
      analysis-input.mp4
      original_script.txt
      voice_sample.mp3
    outputs/
      nonverbal_feedback.json
      transcript.json
      script_feedback.json
      improved_script.txt
      reference_speech.mp3
    logs/
      pipeline.jsonl
      video/           Prompts, raw responses, attempts.jsonl, usage metadata
      asr/             Original ASR response, request count, status
      script/          Prompt, response, attempt log, usage metadata
      elevenlabs/      Cache hit, clone/TTS request counts, status and timing
    manifest.json
  elevenlabs/voice_cache.json
  experiments/
    inputs/            Original local test recordings
    intermediates/     Converted media used in earlier tests
    outputs/           Prior generated audio and analysis outputs
    logs/              Prior prompts, API responses and metadata
```

`ARTIFACTS_DIR` changes the storage root. Processing uses separate files from originals.
Upload filenames and user IDs never become arbitrary filesystem paths. Only final
output filenames are served by the API.

## Request counts and retry behavior

- Normal run: Gemini video 1 + ElevenLabs ASR 1 + Gemini script 1 + ElevenLabs TTS 1.
- First use of a voice: 1 additional ElevenLabs IVC request. Later requests for the
  same user/account reuse the voice ID, even if the recording changes.
- `VIDEO_MAX_ATTEMPTS=3` allows 1 initial request plus 2 retries. Set it to `1` when
  you need exactly two Gemini generation attempts per successful video pipeline.
- Gemini script and ElevenLabs SDK automatic retries are disabled. Failed stages and
  completed outputs remain in the run directory for inspection.
- Video retries cover invalid JSON/schema/time ranges and transient failures,
  excluding permission errors and model safety blocks.
- Logged counts exclude authentication/token refresh. A timeout may consume provider
  usage without returning token metadata.

The local voice cache uses atomic replacement and a thread lock. Run one API worker
for this prototype; multiple workers require a shared database/lock. `/api/pipeline`
uses FastAPI background tasks and returns immediately after upload. The frontend polls
every 2.5 seconds, displays completed stages even if a later stage fails, and restores
the last run on reload. Tasks run in the server process: keep it running until completion.
A server restart does not resume unfinished work. Add authenticated run ownership,
retention rules, and a durable job queue before making the API publicly available.

## CLI and experiments

```bash
backend/.venv/bin/python analyze_presentation.py --max-attempts 3
backend/.venv/bin/python -m backend.experiments.check_gemini
```

The root analysis entry point remains for compatibility. Earlier Gemini TTS and
voice replication tests live under `experiments/`; they are not stages of the new
pipeline. See `.env.example` for configuration.
