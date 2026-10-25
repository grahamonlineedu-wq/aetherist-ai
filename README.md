# Aetherist AI

A meeting assistant that records browser audio, creates live transcripts, turns speech into meeting notes, and exports a PDF.

## Run locally

Requirements: Node.js and npm.

1. Install the frontend dependencies with `npm ci`.
2. Install the API dependencies with `npm --prefix server ci`.
3. Copy `.env.example` to `.env` and add API credentials if transcription or hosted AI refinement is needed.
4. Start the API in one terminal with `npm run dev:api`.
5. Start the web app in another terminal with `npm run dev`.

The Vite development server proxies `/api` and `/socket.io` to the API on port 5000. Set `API_PROXY_TARGET` if the API runs elsewhere. The app works without a separate API URL; set `VITE_API_URL` only when the frontend and API are hosted on different origins.

## Build and run

- `npm test` — API and realtime contract tests
- `npm run build` — create the production frontend in `dist/`
- `npm start` — start the API server; with `NODE_ENV=production` and a built `dist/`, it serves the frontend and API from one origin

For a separate frontend/API deployment, set `VITE_API_URL` at frontend build time and set `CORS_ORIGIN` on the API to the frontend origin or comma-separated origin list.

## API

- `GET /api/health` — API and optional provider status
- `GET /api/session` — active transcript topics
- `GET /api/history` — meeting history cards
- `POST /api/transcribe` — transcribe a base64 audio payload
- `POST /api/refine-speech` — refine transcript text and add the summary to the selected topic
- `POST /api/export-pdf` — return the session PDF as a data URI
- Socket.IO `live-transcript-update` — broadcast updated topics to connected clients

Deepgram is required for audio transcription. OpenAI refinement is optional; without its key, the API returns a local fallback summary. Current session content is held in server memory and resets when the API restarts; history is demo data, not durable storage.

## Supported source

The root `src/` application and `server/index.js` API are the supported implementation. `frontend/` and `server/server.js` are older prototype files and are not used by the documented run commands.
