# Nexa AI backend

## Live voice configuration

Live voice uses the existing backend-only `GEMINI_API_KEY` to mint single-use, short-lived Gemini Live session tokens. The key must have Gemini Live API access enabled; it is never sent to the frontend.

The Live API model defaults to `gemini-3.8-live`. To select another supported Live API model, optionally set `GEMINI_LIVE_MODEL` in the backend environment. Do not add either setting as a `VITE_` frontend variable.

Voice conversation creation, session-token provisioning, and voice-turn persistence all require a valid Clerk-authenticated request. Audio is sent directly from the browser to Gemini over the constrained Live API WebSocket; only completed text transcripts are sent to the backend for storage.
