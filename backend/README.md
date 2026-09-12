# Backend

Independent provider modules, composed by `pipeline/`:

1. `gemini_video`: visual and vocal delivery observations with actionable corrections. Output is
   an object with `nonverbal_feedback` and `vocal_feedback` arrays. Every item uses
   `{start_time, end_time, content}` with `MM:SS.sss` times. Includes schema,
   local validation, bounded retries, raw responses, and cumulative usage logs.
2. `elevenlabs_asr`: extracted recording audio -> verbatim text with Scribe v2.
   Stores the original transcript and word timestamps before revision.
3. `gemini_script`: ASR text -> script issues + revised script in one Gemini call.
   Visual delivery is excluded. The rewritten script retains the original language.
   The legacy direct-video endpoint remains available independently.
4. `elevenlabs_tts`: current recording -> fresh IVC voice -> revised-script MP3.
   Based on the supplied hackathon pipeline; `labels={}` is preserved. API keys are
   read lazily so Gemini-only routes work without ElevenLabs credentials.

## API

Run from the repository root with `uvicorn backend.main:app --reload`.

| Endpoint | Input | Output |
| --- | --- | --- |
| `POST /api/pipeline` | Multipart `file`, `user_id`, optional `noisy_environment` | 202 Accepted, run ID, status URL |
| `POST /api/video/analyze` | Multipart video `file` | Separate visual/vocal feedback arrays; `X-Run-ID` header |
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

The pipeline sends the video with its audio track to Gemini once for visual and vocal
delivery analysis (gaze, gestures, pace, hesitation, articulation, intonation and relative
loudness). Separately, audio
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
      vocal_feedback.json
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

- Normal run: Gemini video 1 + ElevenLabs ASR 1 + Gemini script 1 + ElevenLabs IVC 1 + ElevenLabs TTS 1.
- Every recording creates a fresh IVC from that recording’s extracted audio, including
  repeated uploads by the same user. Legacy voice-cache files are not read or written.
- The returned voice ID and sample hash are recorded in the run’s private
  `logs/elevenlabs/voice.json`; this is provenance, not a reusable voice cache.
- A cloning error or verification requirement stops TTS. No old or default voice is substituted.
- Each recording consumes a new voice slot; existing provider voices are not automatically deleted.
- `VIDEO_MAX_ATTEMPTS=3` allows 1 initial request plus 2 retries. Set it to `1` when
  you need exactly two Gemini generation attempts per successful video pipeline.
- Gemini script and ElevenLabs SDK automatic retries are disabled. Failed stages and
  completed outputs remain in the run directory for inspection.
- Video retries cover invalid JSON/schema/time ranges and transient failures,
  excluding permission errors and model safety blocks.
- Logged counts exclude authentication/token refresh. A timeout may consume provider
  usage without returning token metadata.

`/api/pipeline`
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


## Frontend integration

`GET /api/capabilities` reports whether `/api/ws/landmarks` is registered. The Live
Session UI retains the main-branch overlay design and disables its controls when no
landmark backend is available. Camera + microphone recording still uses the complete
analysis pipeline. Successful uploads navigate to `/evaluation?run=<run_id>`.
Voice Practice displays the active word’s start, end, target duration, and remaining
time with a progress bar; trial playback labels its own measured duration separately.


## Unified main-branch API

`backend.main:app` now composes the imported MediaPipe `/api/v1` routes and the existing
coaching `/api` routes in one server. The imported code lives under `backend/app` and
uses the `backend.app` package consistently. Recorded and live MediaPipe analyses keep
their original result schemas; Gemini/ElevenLabs outputs remain separate run artifacts.
Main frontend uploads and live-session stops start the coaching job once, then link
from the original analysis workspace into Evaluation.

Validation: `backend/.venv/bin/pytest -c backend/pytest.ini backend/tests`.
Frontend unit tests: `cd frontend && npm test`; browser tests: `npm run test:e2e`.

## Google Cloud authentication

Gemini requests always use Google Cloud (`aiplatform.googleapis.com`), including
API-key mode. The AI Studio Gemini Developer API is intentionally not supported
here: its usage is excluded from the $300 Google Cloud Welcome credit program.
Credit eligibility still depends on the project's linked billing account and
remaining eligible credits. Authentication configuration does not upgrade billing.

Default configuration in `backend/.env`:

```dotenv
GEMINI_AUTH_MODE=adc
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_CLOUD_LOCATION=global
```

For a teammate or a deployment, put the complete service-account JSON on one line
in `backend/.env`, enclosed in single quotes:

```dotenv
GEMINI_AUTH_MODE=adc
GOOGLE_CLOUD_PROJECT=your-project-id
GOOGLE_SERVICE_ACCOUNT_JSON='{"type":"service_account","project_id":"your-project-id","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","client_email":"backend@your-project-id.iam.gserviceaccount.com","token_uri":"https://oauth2.googleapis.com/token"}'
```

Use the complete downloaded JSON, not the abbreviated example above. Preserve the
literal `\n` escapes inside the private-key JSON string. The backend parses these
credentials directly; it does not need a local Google login or a separate JSON file.
It checks that the key's project matches `GOOGLE_CLOUD_PROJECT` and fails on invalid
credentials instead of falling back to a developer's user login.

Alternatively, leave `GOOGLE_SERVICE_ACCOUNT_JSON` empty and set
`GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON file outside the repository.
If neither is configured, ADC uses the standard local or deployed Cloud identity.
Share secrets privately and keep `.env` out of Git. Changing identity does not change
the linked billing account or activate paid billing. To check authentication with one
small generation request, run `python -m backend.experiments.check_gemini` from the
repository root.

If your project's administrator permits service-account-bound Vertex API keys:

```dotenv
GEMINI_AUTH_MODE=vertex_api_key
VERTEX_API_KEY=your-cloud-vertex-key
GOOGLE_CLOUD_PROJECT=the-project-that-owns-the-key
```

The key determines the billed project in key mode; `GOOGLE_CLOUD_PROJECT` is used
for request metadata and quota attribution, and must match the key's project.
Use a key restricted to `aiplatform.googleapis.com`. Do not substitute an AI Studio
key. Video analysis and script analysis use the same authentication selection;
missing keys or invalid modes fail instead of silently falling back to ADC.
Keys are transmitted in headers, not query strings. Never commit `.env` or keys,
and never put them in frontend environment variables.

Google documentation: [Cloud API keys](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/start/api-keys?usertype=standard),
[Free Trial coverage](https://docs.cloud.google.com/free/docs/free-cloud-features).

## MongoDB API from gmin

The unified server also includes fake login, TTS reference uploads, per-sentence
and full-recording trials, and reference-scoped ranking from gmin. See [API.md](API.md)
for setup and contracts. `MONGODB_URI` is optional; without it, the current local
coaching flow works and DB endpoints report that MongoDB is unconfigured.
These APIs do not automatically migrate existing file-based runs or change frontend
behavior. Run database tests with the dependencies in `requirements-test.txt`.

## English and Korean

Optional `language=en` or `language=ko` is accepted by the multipart pipeline,
video analysis, script-video analysis, ASR and TTS endpoints. For text-only script
analysis, include `language` in the JSON body. `GET /api/languages` advertises
supported languages and the scoring limitation. Invalid request language codes
return HTTP 422 before any provider call. The frontend should send the language
selected by the user with each request. There is no server-wide language setting.
Omission is supported only for backward compatibility with existing clients.

```bash
curl http://localhost:8000/api/pipeline \
  -F 'file=@test-input.mov' -F 'user_id=demo-user' -F 'language=ko'

curl http://localhost:8000/api/script/analyze \
  -H 'Content-Type: application/json' \
  -d '{"script":"Hello everyone. Today I will introduce our project.","language":"en"}'
```

The selected language describes the recording/script language and controls Gemini
feedback and the improved script. `original_script` stays verbatim. Gemini uses
explicit language instructions; this is a generative instruction, not a guaranteed
language validator. ASR receives `eng`/`kor`. With the default
`eleven_multilingual_v2`, TTS infers language from the revised text: that model
supports English and Korean but does **not** support forcing `language_code`.
Other configured TTS models receive the selected ISO language code. For standalone
TTS calls, supply a script already written in the selected language.

When no language is selected, existing behavior is retained: Korean feedback,
original-language improved script, and automatic ASR/TTS language inference. Selected
language is saved in run manifests and provider metadata. The frontend upload and live-analysis screens let the user select English or Korean
before starting. The selection is retained for retries of the same analysis.

**Practice pronunciation scoring remains English-only.** Korean analysis, script
revision, TTS and generated word timing are supported; the existing MMS pronunciation
scorer is not a Korean scorer, and practice creation continues to reject unsupported
scripts rather than producing misleading scores.

Provider references: [ASR language hint](https://elevenlabs.io/docs/api-reference/speech-to-text/convert),
[TTS language parameter limitations](https://elevenlabs.io/docs/api-reference/text-to-speech/convert-with-timestamps).

## Vocal delivery analysis

The first Gemini request receives an MP4 with both video and AAC audio; FFmpeg
preserves the input audio track. The delivery prompt explicitly requests audible
feedback, alongside visible delivery observations. The second Gemini request still
receives the ElevenLabs transcript for script revision only. Normal processing
therefore remains **two Gemini generation calls**; bounded retries can add requests.

The model returns an object with exactly two arrays:

```json
{
  "nonverbal_feedback": [{"start_time":"00:01.000","end_time":"00:03.000","content":"Visual observation and correction"}],
  "vocal_feedback": [{"start_time":"00:05.000","end_time":"00:07.000","content":"Audible observation and correction"}]
}
```

Both arrays are required, including empty arrays when no issues are found. Each
entry still contains exactly `start_time`, `end_time`, and `content`. Arrays are
validated and sorted independently; identical intervals across the two modalities
are allowed. An invalid/missing array causes the same bounded retry behavior as
other validation failures. Mixed visual/vocal observations in a single item are
explicitly excluded by the prompt. Provider metadata includes per-category counts.

`POST /api/video/analyze` now returns this two-array object instead of a flat array.
The pipeline stores separate `outputs/nonverbal_feedback.json` and
`outputs/vocal_feedback.json` files and exposes both in the run's `results` and
`outputs` objects. The frontend displays **Nonverbal delivery** and **Vocal delivery**
as separate sections; either section's timestamp seeks the original recording.
Old runs are not regenerated: an absent vocal result is shown as unavailable,
whereas an empty array means the analysis completed with no flagged issues.

This is qualitative coaching, not calibrated WPM/dB/pitch measurement or the
separate trial pronunciation score. The normal pipeline still makes two Gemini
calls: one joint visual/audio analysis returning two arrays, and one script revision.

## Practice word duration display

Each timed word has a translucent clickable box and a small start–end label inside the lower edge in
seconds (for example, `0.2–0.4s`). Box width uses 160 pixels per second of spoken
duration, with a 56-pixel readability minimum and the available container width as
a maximum. Widths and labels follow reference timing during guided practice and
the selected trial's alignment during trial playback. Existing active-word tracking
and click-to-seek behavior are retained.

## Script scenarios and overall practice progress

The setup controls appear above recording/upload and accept `script_style`:
`presentation` (default), `interview`, `formal`, `informal`, `friend`, or `pitch`.
The selected scenario guides the Gemini script revision while the original transcript
stays verbatim and source facts remain unchanged. Interview/pitch prompts explicitly
forbid inventing experience, results, metrics or promises. Style controls apply in
English and Korean, with the existing language selection.
The revised text is passed to TTS; no additional model request is added.

`POST /api/pipeline` and `POST /api/script/analyze-video` accept the field as multipart
form data. `POST /api/script/analyze` accepts it in JSON. It is saved in the run
manifest and script logs, retained on retries, and shown beside the reviewed transcript.

```bash
curl http://localhost:8000/api/pipeline \
  -F 'file=@test-input.mov' -F 'user_id=demo-user' \
  -F 'language=en' -F 'script_style=interview'
```

Practice now shows elapsed time and total audio duration in one continuous progress
bar. It uses the full TTS recording during reference playback or the silent recording
guide, and the selected trial's full duration during trial playback. The reference
guide stops at 100% if the user continues recording. Word highlighting and timing
boxes remain available, but no longer reset the progress bar at each word boundary.

## Natural voice delivery

Accent selection has been removed. New Gemini vocal analyses assess clarity, pace,
pauses, articulation and intonation without a regional-accent target. TTS reads the
improved script with a fresh clone of the current recording and the configured model (default
`eleven_multilingual_v2`), without injected accent tags or automatic model switching.
Existing saved audio and PoC artifacts are unchanged.

## Guest demo profiles and visible generation stages

`POST /api/auth/guest` returns a fresh `{user_id, name, email: null, is_guest: true}`
without requiring profile fields. MongoDB stores an independent guest record with a
reserved unique key; `/api/auth/login` cannot reuse that key as an email. Guest IDs
follow the existing X-User-Id history ownership checks. This remains the demo
identity mechanism, not a replacement for production authentication.

The recording pipeline exposes `voice_cloning` while IVC runs and
`speech_generation` while TTS runs. These checkpoints drive frontend provider
indicators; they add no model calls. Cloning failures preserve script/feedback and
report the cloning stage instead of implying that synthesis started.
