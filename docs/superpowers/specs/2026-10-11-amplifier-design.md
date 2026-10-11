# Amplifier — Design Spec (2026-10-11)

Personal YouTube automation platform: visual node-based dashboard, one virtual control center + N channel sub-nodes (Google OAuth per channel). Upload once, review metadata, select destination channels, Publish to all. Per-channel independent status tracking. MERN, Vercel (frontend) + Render (backend), Cloudinary staging with 1h auto-delete, single-user login.

## 1. Goals / Non-goals
Goals:
- Connect multiple YouTube channels via Google OAuth, one sub-node per channel.
- Upload video once, reuse for all destinations.
- Same metadata everywhere (title, description, tags, privacy).
- Publish fan-out with per-channel status (queued/uploading/processing/succeeded/failed).
- Clean modern UI with draggable nodes + connecting lines (visual only, no workflow execution).
- Personal access only.

Non-goals v1:
- No per-channel metadata overrides, no scheduling, no analytics, no multi-user management, no queue/Redis, no automated tests.

## 2. Architecture (Approach A: Central orchestrated backend)
```
[Vite React on Vercel] → [Express API on Render] → [MongoDB Atlas]
        |                          |
[React Flow canvas]      [Cloudinary staging, 1h TTL] → [YouTube Data API v3 × N]
```
- Frontend: Vite + React + React Flow + Tailwind. Pages: Login, Dashboard (canvas), Upload/Review/Publish, Channel detail.
- Backend: Express + Mongoose + JWT + multer → Cloudinary + googleapis + node-cron (cleanup every 10 min).
- Upgrade path: isolate `uploadService` so BullMQ + Upstash Redis can replace in-memory async loop later.

Alternatives considered:
- B queue-based (robust, extra infra — deferred).
- C browser-direct to YouTube (no backup, N uploads, CORS/token risk — rejected).

## 3. Components
- `auth`: `ADMIN_EMAIL` + bcrypt `ADMIN_PASSWORD_HASH` in env, `POST /api/auth/login` → JWT (7d). Middleware `requireAuth` on all APIs.
- `channels`: OAuth start `GET /api/channels/oauth-url`, callback `GET /api/channels/callback?code=` → exchange, store AES-encrypted refresh token (`TOKEN_ENCRYPTION_KEY`), fetch `youtube.channels.list(mine=true)` for title/thumbnail. `GET /api/channels`, `DELETE /api/channels/:id`.
- `videos`: `POST /api/videos` (multipart, memory/multer 2GB limit) → Cloudinary `resource_type: video` → save `{cloudinaryUrl, cloudinaryPublicId, cloudinaryExpiresAt = now+1h}`. `GET /api/videos/:id`.
- `publications`: `POST /api/publications {videoId, channelIds[], metadata}` → create N docs `queued`, trigger async fan-out (no await). `GET /api/publications?videoId=` for polling. Fan-out per channel: set `uploading`, stream from Cloudinary URL → `youtube.videos.insert`, set `processing`, poll `videos.list` → `succeeded` + `youtubeVideoId`, on error `failed` + `error`.
- `cleanup`: cron deletes Cloudinary assets where `expiresAt < now`, marks orphan videos.
- `frontend canvas`: React Flow, main control-center node + channel nodes, drag to arrange, edges main→channel, click node → stats/actions, checkbox select for publish, color by status.

## 4. Data flow
1. Login → JWT in localStorage.
2. Add Channel → Google consent (`youtube.upload youtube.readonly`) → backend stores token → node appears.
3. Upload → backend → Cloudinary → preview.
4. Review metadata + select channels → Publish.
5. Backend fans out, frontend polls every 5s, edges/nodes color update.
6. Cron deletes Cloudinary file 1h after upload.

## 5. Data model (MongoDB)
- `Channel {_id, youtubeChannelId, title, thumbnail, encryptedRefreshToken, status: connected|needsReconnect, lastSyncAt}`
- `Video {_id, cloudinaryUrl, cloudinaryPublicId, cloudinaryExpiresAt, metadata {title, description, tags[], privacy: public|unlisted|private}, createdAt}`
- `Publication {_id, videoId ref, channelId ref, status: queued|uploading|processing|succeeded|failed, youtubeVideoId?, error {code,message}?, progress?}`

## 6. Error handling
- Per-channel independent; one failure doesn't block others.
- `invalid_grant` → channel `needsReconnect`, UI prompts re-OAuth.
- `quotaExceeded` → mark failed, surface retry button.
- Render timeout safety: Publish returns immediately with `queued`; uploads run in background; frontend polls.
- Cloudinary delete failure logged, retried next cron tick.

## 7. Env / Deploy
Backend (Render): `MONGO_URI, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD_HASH, CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET, GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI, TOKEN_ENCRYPTION_KEY, FRONTEND_URL, PORT`.
Frontend (Vercel): `VITE_API_URL`.
- `client/` → Vercel, `server/` → Render Web Service (`npm start`), MongoDB Atlas free tier.

## 8. Open questions resolved
- Cloudinary staging with 1h delete: yes.
- Same metadata everywhere: yes.
- Single hardcoded user: yes.
- Canvas visual only: yes.
