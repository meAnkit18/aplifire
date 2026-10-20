# Agent API — using Amplifier as a YouTube bridge

Amplifier exposes a small REST API that local agents (scripts, Claude Code,
Cursor, etc.) can call with a single secret: `PIPELINE_API_KEY`.

## Base URL

- Production: `https://amplifier-api.onrender.com`
- Local: `http://localhost:5000`

## Authentication

Every `/api/*` endpoint (except `/api/health` and `/api/channels/callback`)
accepts either:

- `Authorization: Bearer <admin JWT>` (from `POST /api/auth/login`), or
- `Authorization: Bearer <PIPELINE_API_KEY>` (recommended for agents).

The pipeline key is read from the `PIPELINE_API_KEY` env var on the server.
Keep it secret; rotate by changing the env var and redeploying.

## Quick flow for an agent

1. List connected channels:
   ```
   GET /api/channels
   ```
2. Stage a video (file upload or from URL):
   ```
   POST /api/videos            (multipart field "file")
   POST /api/videos/from-url    { "url": "https://.../video.mp4" }
   ```
   → `{ videoId, url, expiresAt }` (Cloudinary staging, auto-deleted in 1h)
3. Publish to one or more channels:
   ```
   POST /api/publications
   { "videoId": "...", "channelIds": ["<mongo _id from GET /api/channels>"], "metadata": { "title", "description", "tags": [], "privacy": "public|unlisted|private" } }
   ```
   → `{ ids: [publicationId, ...] }`
4. Poll status:
   ```
   GET /api/publications?videoId=<id>
   GET /api/publications/<publicationId>
   ```
   Statuses: `queued → uploading → processing → succeeded | failed`.
   On `succeeded`, `youtubeVideoId` is set.
5. Analytics:
   ```
   GET /api/analytics/overview?range=28d
   GET /api/analytics/videos/<videoId>?range=28d
   GET /api/analytics/channels/<channelId>
   POST /api/analytics/refresh   { "videoId": "..." }   (optional, throttled 15m)
   ```

## Direct YouTube access

If an agent prefers to call the YouTube Data API directly, mint a short-lived
access token for a connected channel:

```
GET /api/channels/<id>/token     (id = mongo _id, youtubeChannelId, or "me")
→ { access_token, expires_in, youtube_channel_id, title }
```

Use it as `Authorization: Bearer <access_token>` against
`https://www.googleapis.com/youtube/v3/...`.

## Imports

```
POST /api/imports/instagram   { "url": "https://www.instagram.com/reel/..." }
```
Downloads the reel, stages it on Cloudinary, and returns suggested metadata.

## Notes

- Cloudinary staging files expire after 1 hour; publish within that window.
- Per-channel failures are independent; one channel failing does not block others.
- `invalid_grant` marks a channel `needsReconnect` — re-run OAuth in the UI.
- Analytics refresh is throttled to once per 15 minutes per publication.
