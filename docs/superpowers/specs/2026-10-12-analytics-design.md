# Per-Video + Overall Analytics — Design

Date: 2026-10-12
Status: approved, pending implementation plan

## Goal

Add analytics for each video (one upload published to N channels) and an
overall dashboard. Per-video view shows totals across channels plus a
per-channel breakdown. Overall view shows totals across all videos and
channels plus per-video and per-channel tables.

Metrics v1 = everything possible via YouTube APIs:
- Data API (cheap, live): views, likes, comments, channel subs/video counts.
- Analytics API (quota-heavy, 1-2 day delay): watch time, avg view duration,
  subs gained, traffic source, device, geography, age/gender.

## Non-goals

- Real-time streaming stats (YouTube delays Analytics API anyway).
- Time-series warehouse with daily rollups for every dimension (deferred;
  schema leaves room for it).
- Instagram source analytics (no API for reel views).
- Export CSV/PDF (deferred).

## Flow

1. User opens new `Analytics` nav view.
2. Client calls `GET /api/analytics/overview?range=28d`; server reads cached
   stats from Mongo and returns instantly (no YouTube calls on read path).
3. User expands a video row: client calls
   `GET /api/analytics/videos/:videoId?range=28d` for per-channel breakdown
   + totals + top dimensions.
4. `Refresh` button (per video or overall) calls
   `POST /api/analytics/refresh { videoId? }`; server throttles (min 15 min
   per publication), fans out to YouTube, updates cache, returns fresh totals.
5. Nightly cron (`node-cron`, already a dep) syncs all `succeeded`
   publications; updates `Channel.lastSyncAt`.

## Components

1. `server/src/youtube.js` — add `yt-analytics.readonly` to `oauthUrl()`
   scopes. Add `authedAnalytics(refreshToken)` via
   `google.youtubeAnalytics('v2')`. Existing users must reconnect once.
2. `server/src/analytics.js` (new, pure + fetchers):
   - `fetchVideoStats(yt, youtubeVideoIds[])` — `videos.list statistics`,
     batched 50 per call.
   - `fetchChannelStats(yt)` — `channels.list statistics mine`.
   - `fetchVideoAnalytics(ya, channelId, videoId, startDate, endDate)` —
     `reports.query` for watch time, avg duration, subs gained, traffic,
     device, geo, age/gender. Fail-soft per dimension.
   - `totalsFor(publications[])` — sums views/likes/comments/watch/subs.
3. Models:
   - `Publication` += `stats { views, likes, comments, watchMinutes,
     avgViewDurationSec, subsGained }`, `dimensions { traffic[], device[],
     geo[], ageGender[] }` (top-5 each, capped), `statsUpdatedAt`.
   - `Channel` += `stats { subs, totalViews, videoCount }` (from Data API).
   - No new collection in v1; history = overwrite snapshot + keep
     `statsUpdatedAt`. Daily table deferred but field names match future
     `MetricDaily` rows.
4. `server/src/routes/analytics.js` (new, behind `requireAuth`):
   - `GET /overview?range=` — aggregates cached stats: totals, per-video
     (join Video + Publications), per-channel.
   - `GET /videos/:videoId?range=` — one video's totals + per-channel rows.
   - `GET /channels/:channelId` — one channel's totals + its videos.
   - `POST /refresh` — throttled sync, returns `{ synced, skipped }`.
5. Client `pages/Analytics.jsx` (new) + nav button in `App.jsx`:
   - Overall cards (views, watch hrs, likes, comments, subs gained),
     range picker 7/28/90d, per-video table (expandable), per-channel table.
   - No new chart dep in v1: CSS bars + totals. Recharts deferred to keep
     bundle small; add when trend lines needed.
   - `api.js` += `overview(range)`, `videoAnalytics(id, range)`,
     `channelAnalytics(id)`, `refreshAnalytics(payload)`.

## Error handling

- Token `invalid_grant` during sync: mark `Channel.status='needsReconnect'`,
  keep last cached stats, surface "reconnect" badge (same pattern as
  `fanout.js`).
- Analytics API 403/quotaExceeded: keep Data API stats, set
  `dimensions=null`, surface "analytics quota hit, retry later".
- Video deleted/private on YouTube: keep cached row, flag `stale:true`.
- Refresh throttle: 429 with `retryAfterSec` when <15 min since last sync.
- Range validation: only `7d|28d|90d`, default `28d`.

## Testing

- Vitest pure tests: `totalsFor()` aggregation, range parsing, throttle check.
- Supertest route tests: auth required, range validation, throttle 429,
  aggregation shape against seeded in-memory docs (no live YouTube calls).
- Live GUI pass: connect 2 channels, publish 1 reel, refresh analytics,
  verify per-video totals = sum of channels, overall = sum of videos.
