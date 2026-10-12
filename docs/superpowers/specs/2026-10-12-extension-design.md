# Instagram Uploader Chrome Extension — Design

Date: 2026-10-12
Status: approved, pending implementation plan

## Goal

While scrolling the Instagram reels feed in Chrome, every reel shows an
Upload button. One click publishes that reel to all connected YouTube
channels automatically.

## Non-goals

- Explore grid, single post pages, stories.
- Review/edit step, per-channel status history.
- Chrome Web Store publishing (unpacked install).
- Backend changes: none. The extension only calls existing endpoints.

## Components (`extension/`)

1. `manifest.json` — Manifest V3. Host permission for the Instagram
   reels feed, `storage` permission for the token, popup + content
   script registration.
2. `content.js` — Runs on the reels feed. A `MutationObserver` adds an
   Upload button to each reel article as it scrolls into view (including
   reels already on screen). The reel permalink is read from the
   article's link to `/reel/<id>/`. On click the button shows a spinner,
   performs the three-call sequence below, then shows ✓ or the error
   text on the reel. Clicks while busy are ignored (no duplicates).
3. `popup.html` / `popup.js` — Email + password login form calling
   `POST /api/auth/login` on the production API. The token is saved in
   `chrome.storage.local` and attached as `Bearer` on every call. The
   popup also shows logged-in state and logout.

## Click flow

1. `POST /api/imports/instagram` with the reel permalink. Reuses the
   server's download → Cloudinary → staged `Video` path. Returns
   `{ videoId, metadata }`.
2. `GET /api/channels` for the current channel list.
3. `POST /api/publications` with `{ videoId, channelIds: all, metadata }`
   (title/description/tags from step 1, privacy `public`). The existing
   fanout takes it from there.

## Error handling

- Not logged in: button prompts to open the popup login.
- Non-reel or unreadable link: button shows the error, nothing sent.
- Private/deleted/rate-limited reel: the server's 502 reason is shown.
- No connected channels: shown before anything downloads.
- Network/backend asleep: reason shown with implied retry (click again).
- All errors appear as text on the reel's button; success is ✓.

## Testing

- Unit tests for permalink extraction and the three-call upload
   sequence with mocked `fetch`/`chrome` APIs.
- Live pass: load unpacked, scroll the reels feed, confirm a button on
   each reel, upload one reel, confirm it reaches all channels with the
   caption's title, description, and tags.
