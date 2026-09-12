# Presentation analysis

Analyze the video's visuals and synchronized audio with Google Cloud
`gemini-3.8-flash`, using existing Application Default Credentials.

```bash
backend/.venv/bin/python analyze_presentation.py
backend/.venv/bin/python analyze_presentation.py --input outputs/presentation-analysis-input.mp4 --max-attempts 3
```

Dependencies: `google-auth`, `requests`, and FFmpeg. FFmpeg is resolved from PATH
or the existing `.tools/imageio_ffmpeg/binaries` directory. The input must be an
MP4 with an audio track and small enough for inline API submission. The default
input is the compressed copy of `test-input.mov`. Video duration is read from
the media file; timestamps are relative to the submitted file.

## Output

`outputs/presentation-analysis.json` contains a JSON array:

```json
[
  {
    "start_time": "00:01.000",
    "end_time": "00:03.500",
    "content": "관찰된 발표 전달상의 문제"
  }
]
```

The API receives a response schema as well as the prompt. Local validation checks
the top-level array, exactly three fields, timestamp format `MM:SS.sss`,
`0 <= start < end <= video duration`, chronological ordering, nonempty content,
duplicate events, duplicate JSON fields, and successful completion (`STOP`).
Distinct events may overlap. `[]` is valid when no problems are observed.
These checks validate structure and timing bounds, not whether the model's
observations are factually correct.

## Retries and logs

- Default: 3 total attempts, meaning at most 2 retries. Change with
  `--max-attempts` (1–10).
- Retry malformed/incomplete output, network errors/timeouts, and HTTP
  408/429/500/502/503/504. Wait 2 seconds, then 4 seconds, doubling up to 30 seconds.
- On output validation errors, include the validation error in the next prompt.
- Stop immediately on other HTTP errors, including 400/401/403/404, authentication
  errors, and model safety blocks.
- Each request can incur usage charges, including attempts whose outputs fail
  validation. A network timeout may have consumed tokens without returning usage.

Each run has a unique directory under `outputs/presentation-analysis-runs/`:

- `attempts.jsonl`: timestamped start/end events, outcomes, errors, HTTP status,
  elapsed time, retry scheduling, and returned token usage.
- `attempt-NN-prompt.txt` and `attempt-NN-response.txt`: exact prompt and API
  response for each attempt; no input video payload or auth tokens are logged.
- `meta.json`: final status, attempt/retry counts, cumulative reported token
  usage, and paths to the result and logs.
- `result.json`: written only after successful validation.

`outputs/presentation-analysis-meta.json` tracks the latest run, including failures.
`outputs/presentation-analysis.json` remains the last successful result if a later
run fails. Check the latest metadata status before treating it as a new result.
Writes to result and metadata JSON files use temporary files and atomic replacement.
Use separate `--output-dir` directories for concurrent executions.

## Verification

```bash
backend/.venv/bin/python -m unittest -v backend.tests.test_gemini_video
```

The tests use a mocked API and do not incur model charges.


The current nonverbal-only implementation is in `backend/gemini_video/`. Legacy
`outputs/` and `test-input.mov` paths are local compatibility symlinks into
`backend/artifacts/experiments/`. New API runs use the layout in `backend/README.md`.
