# aplifire (Amplifier)

Personal YouTube automation platform: connect your YouTube channels, stage a
video once, and publish it to all of them. Includes per-channel status
tracking and analytics. Also usable as an HTTP bridge by local agents via
`PIPELINE_API_KEY`.

- Frontend: Vite + React — Vercel https://amplifier-sand.vercel.app, plus a
  same-origin mirror at https://amplifier-api.onrender.com
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

## Reachable mirror (Render)

Some ISPs (notably in India) blackhole Vercel's anycast IPs, so
`*.vercel.app` times out even though the deployment is healthy. The Express
server therefore also serves the built client at `/`, which makes
https://amplifier-api.onrender.com a fully working copy on networks that can
reach Render.

The bundle in `server/public` is committed. Rebuild it after frontend changes:

```
cd server
npm run build:client
git add public && git commit -m "build: refresh client bundle"
```

`server/public/index.html` is served at `/`; `/api/*` is never shadowed.
The OAuth callback returns to whichever trusted origin started the flow.

