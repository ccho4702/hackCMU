# Integration provenance

Imported from `ccho4702/hackCMU`, branch `gmin`, commit
`0c94ed5f233d809ae9b0b9417deb5ce3e8592a8f`.

The original scoring formulas remain in `shadow_score.py`. Integration changes:

- Exclude vocabulary id 0 (CTC blank, represented by `-`) from normalized targets.
  This fixes alignment failures for spoken numbers containing hyphens.
- Use a relative import in `selftest.py` so both `python -m scoring.selftest` from
  `backend/` and `python -m backend.scoring.selftest` from the repository root work.
- `backend/practice/` handles uploads, WAV conversion, reference binding, model
  warmup, timestamps, repeated trials, finite JSON values, and unreliable scores.
- Torch/TorchAudio 2.8 are pinned because this module uses `forced_align`.
