# Instagram Reel Import — Design

Date: 2026-10-11
Status: approved, pending implementation plan

## Goal

Paste an Instagram reel link; the app automatically downloads it and
publishes it to every connected YouTube channel. Reels only, fully
automatic, title/description taken from the reel caption.

## Non-goals

- Posts, IGTV, stories (stories need an Instagram login).
- Review/edit step before publishing.
- Carousel posts (first-video-only handling excluded for now).

## Flow

1. User pastes a reel link into the "Import from Instagram" box on the
   Upload page and submits.
2. Client calls `POST /api/imports/instagram` with `{ url }`.
3. Server validates the URL is an `instagram.com/reel/` link.
4. Server runs `yt-dlp` to download the MP4 plus caption JSON into
   `os.tmpdir()`.
5. Server streams the file into Cloudinary via the existing upload path,
   creating a `Video` doc. Temp file is deleted afterwards.
6. Server creates `Publication` docs for every connected channel with
   metadata `{ title, description, privacy: 'public' }` where title is
   the caption's first line (max 100 chars, fallback
   `Instagram reel <id>`) and description is the full caption plus the
   source link. Existing fanout is kicked off.
7. Server returns `{ videoId }`; client shows the existing per-channel
   status list and polls it as today.

## Components

1. `server/src/instagram.js` — pure helpers, no network:
   - `isReelUrl(url)` validates and normalizes reel links.
   - `titleFromCaption(caption, reelId)` derives the title with fallback.
2. `server/src/routes/imports.js` — `POST /api/imports/instagram`,
   behind `requireAuth`. Uses the `yt-dlp-exec` npm package (fetches the
   `yt-dlp` binary at build time so it works on Render). Rejects when no
   channels are connected before downloading anything.
3. Client Upload page — link input, submit button, busy state; errors
   shown via `alert()`, matching the page's existing pattern.

## Error handling

- Non-reel URL: 400, no network call.
- Private, deleted, or rate-limited reel: 502 with yt-dlp's reason.
- No connected channels: 400 before download.
- Cloudinary / per-channel YouTube failures: existing Video and
   Publication status flows (per-channel `succeeded` / `failed`).

## Testing

- Vitest unit tests for URL validation and caption helpers.
- Supertest route tests for auth and input validation against the real
   app. The `yt-dlp` binary itself is not unit-tested; verified live
   with a real reel plus a GUI pass of the import box.
