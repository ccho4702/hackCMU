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
