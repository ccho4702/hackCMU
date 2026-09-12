# Optune frontend

Run `npm ci` and `npm run dev` in this directory. Run the unified backend separately;
see the repository root README for authentication and setup.

Browser requests use relative `/api/...` URLs by default, including live recording,
so Next.js forwards them to the same backend through `next.config.mjs`.
`BACKEND_URL` defaults to `http://localhost:8000`. Set it when running against a
different backend port; for production builds, set it during both build and start.
Leave `NEXT_PUBLIC_API_BASE_URL` unset for this setup. An explicit public API URL
remains supported for deployments that intentionally use a separate origin.

The studio uses a light theme with blue controls. Evaluation and practice reference
panels share `public/banner_dark.png`; the overview artwork is `public/studio-cover.jpg`.
Practice word boxes retain their audio-duration widths. Only overflowing words shrink
to fit one line, while their timestamps remain below the word inside each box.

## Overview demo

Overview includes an explicitly labeled product-demo video with native playback
controls. It loads on demand, with no autoplay or recording/analysis request.
`public/demo/optune-demo.mp4` packages the published `../assets/demo.mp4` in the
standalone frontend and Docker image. Keep these identical when replacing the demo;
`public/demo/optune-demo-poster.png` mirrors the published poster. The deployment sync
rules include only these public demo MP4s while excluding private recordings.

## Guest mode and processing feedback

Guest mode is available beside Log in and on the login form. It creates a unique
MongoDB demo profile without name/email input. Its ID and run state live in this
tab's sessionStorage, separately from registered profiles and other guests.
Closing the tab forgets the local identity; it does not delete server recordings.
History uses the existing per-user checks. MongoDB is still required.

Evaluation shows the active provider and stage. Gemini handles delivery review and
script refinement; ElevenLabs handles transcription, fresh voice cloning, and TTS.
The indicator is indeterminate, with no invented completion percentage. Completed
outputs remain visible while later stages run. Reduced-motion preferences disable
the animated marks and progress sweep.
