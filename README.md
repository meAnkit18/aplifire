# aplifire (Amplifier)

Personal YouTube automation platform: connect your YouTube channels, stage a
video once, and publish it to all of them. Includes per-channel status
tracking and analytics. Also usable as an HTTP bridge by local agents via
`PIPELINE_API_KEY`.

- Frontend: Vite + React (Vercel) — https://amplifier-sand.vercel.app
- Backend: Express + MongoDB (Render)
- Docs: `docs/AGENT_API.md` (agent bridge), `docs/superpowers/` (design specs)

## Run locally

Backend:
```
cd server
cp .env.example .env   # fill in values
npm install
npm start
```

Frontend:
```
cd client
npm install
npm run dev
```
Set `VITE_API_URL=http://localhost:5000` in `client/.env` for local dev.

## Vercel

The Vercel project root directory **must** be `client` (Project → Settings →
General → Root Directory). With the default repo root, Vercel finds no
`package.json` and the build fails with `vite: command not found` (exit 127).
