# Agent API — using Amplifier as a YouTube bridge

Amplifier exposes a small REST API that local agents (scripts, Claude Code,
Cursor, etc.) can call with a single secret: `PIPELINE_API_KEY`.

## Base URL

- Production: `https://amplifier-api.onrender.com`
- Local: `http://localhost:5000`

## Authentication

Every `/api/*` endpoint (except `/api/health` and `/api/channels/callback`)
accepts any of:

- `Authorization: Bearer <admin JWT>` (from `POST /api/auth/login`, expires in 7 days)
- `Authorization: Bearer <PIPELINE_API_KEY>` (server env var)
- `Authorization: Bearer amp_...` (long-lived key stored in MongoDB)

### Create a long-lived agent key

Log in as the admin (in the UI, or `POST /api/auth/login`), then:

```
POST /api/auth/agent-key        { "label": "my-laptop" }
→ { "id": "...", "key": "amp_...", "prefix": "amp_..." }
```

The plaintext key is returned **once**; only a hash is stored. List and revoke:

```
GET    /api/auth/agent-key
DELETE /api/auth/agent-key/<id>
```

Keep the key secret; revoke and create a new one if it leaks.

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

## Direct YouTube access (recommended for large files)

If an agent prefers to call the YouTube Data API directly, mint a short-lived
access token for a connected channel:

```
GET /api/channels/<id>/token     (id = mongo _id, youtubeChannelId, or "me")
→ { access_token, expires_in, youtube_channel_id, title }
```

Use it as `Authorization: Bearer <access_token>` against
`https://www.googleapis.com/youtube/v3/...`.

Why this matters: `/api/videos` buffers the file in the server process and
stages it on Cloudinary, which is fine for small clips but can hit Render's
memory/time limits for large uploads. For big files, have the agent stream the
local file straight to `youtube.videos.insert` with the minted token. The
refresh token stays on the server; the agent only ever sees a 1-hour access
token.

Example (Python, google-api-python-client):

```python
# token = GET /api/channels/me/token -> access_token
creds = google.oauth2.credentials.Credentials(token)
youtube = googleapiclient.discovery.build("youtube", "v3", credentials=creds)
youtube.videos().insert(
    part="snippet,status",
    body={"snippet": {"title": "...", "description": "..."},
          "status": {"privacyStatus": "private"}},
    media_body=googleapiclient.http.MediaFileUpload("video.mp4", chunksize=-1, resumable=True),
).execute()
```

## Target one channel (not all)

Connecting multiple channels is for authentication only. When publishing, send
only the target channel's `_id` in `channelIds`:

```
GET /api/channels
→ [{ "_id": "...", "title": "Wild Thinking", "youtubeChannelId": "..." }]

POST /api/publications
{ "videoId": "...", "channelIds": ["<Wild Thinking _id>"], "metadata": { ... } }
```

## Register an upload made directly through YouTube

If an agent streamed the file to YouTube itself (recommended for large files),
register it so analytics can track it:

```
POST /api/publications/register
{ "channelId": "<mongo _id or youtubeChannelId>",
  "youtubeVideoId": "dQw4w9WgXcQ",
  "metadata": { "title": "...", "description": "...", "tags": [], "privacy": "public" } }
→ { publicationId, videoId, channelId, youtubeVideoId }
```

The returned `videoId` is what `/api/analytics/videos/:videoId` expects.

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
