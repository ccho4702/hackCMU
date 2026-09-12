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

## Voice practice and word timing

After TTS completes, **Practice this script** opens `/practice?run=<run_id>`.
The page plays the fixed TTS reference, displays its script with a current-word cue,
records microphone-only trials with a three-second count-in, and shows a history of
pronunciation, pace, rhythm, intonation, and emphasis measurements. No overall score
is calculated. `unreliable` results hide all numeric scores and invite another take.

- `GET /api/runs/{run_id}/practice`: reference, word times, scoring-engine state, and recent trials.
- `POST /api/runs/{run_id}/practice/alignment`: prepare timing for an older TTS recording; cached by audio hash.
- `POST /api/runs/{run_id}/trials`: multipart audio `file`; returns 202 with a trial ID.
- `GET /api/runs/{run_id}/trials/{trial_id}`: state and score.
- `GET /api/runs/{run_id}/trials/{trial_id}/audio`: replay the uploaded trial as 16kHz mono WAV.

Trial files live under `artifacts/runs/<run_id>/trials/<trial_id>/`, with separate
`inputs/`, `intermediates/`, `outputs/score.json`, `logs/`, and `manifest.json`.
The reference is selected by the server from that run's TTS output and improved script;
clients cannot replace the reference audio or submit a different scoring transcript.

New TTS uses ElevenLabs `convert_with_timestamps`: audio and character alignment arrive
in the same generation request. Character times are grouped into words and saved as
`outputs/reference_alignment.json`. Older outputs use the Forced Alignment API when
permitted; if unavailable, the local MMS aligner supplies estimated word times. The
alignment source and audio hash are recorded. Timing preparation is a separate explicit
POST for older outputs; opening the page does not invoke an additional ElevenLabs API.

During reference playback, highlights use `audio.currentTime`. During recording, a
silent visual guide follows the reference clock. It is **not live speech recognition**.
After scoring, trial playback uses that recording's own forced-alignment word times.
The reference player is paused during recording to prevent speaker audio entering the mic.

`backend/scoring/` comes from `gmin` commit `0c94ed5`; see its README for the formulas
and calibration limits. Torch and TorchAudio are pinned to 2.8 because forced alignment
was removed in 2.9. A first-time MMS model download is about 1.2GB. Loading begins in
the background when the practice page is opened, then the model is reused. CPU scoring
is serialized to protect the feature hook. Set `SCORING_CPU_THREADS` (default 4) to
control CPU load. Practice currently supports English scripts; numbers are expanded
for alignment. The imported normalizer was fixed to exclude CTC blank characters
(e.g. the hyphen in `twenty-seven`) from target tokens.

Scoring runs locally and makes no Gemini or ElevenLabs generation calls. The numerical
scores are experimental reference comparisons; real microphone conditions can affect
absolute scores. Keep one backend worker for the local cache/locks.
