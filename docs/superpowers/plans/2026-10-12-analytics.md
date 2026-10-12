# Per-Video + Overall Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cached per-video-across-channels + overall analytics backed by YouTube Data + Analytics APIs with manual refresh and nightly sync.

**Architecture:** Read path serves Mongo snapshots instantly; write path (`POST /refresh` + nightly `node-cron`) fans out to YouTube, updates `Publication.stats`/`Channel.stats`. New `analytics.js` service isolates all Google calls; new `routes/analytics.js` serves overview/video/channel aggregates.

**Tech Stack:** Node Express Mongoose googleapis@140, React 18 Vite, node-cron@3 (already installed), vitest + supertest.

## Global Constraints

- Existing OAuth scopes in `server/src/youtube.js` are `youtube.upload` + `youtube.readonly`; new scope `https://www.googleapis.com/auth/yt-analytics.readonly` must be appended, existing users reconnect once.
- Refresh throttle is 15 minutes per publication; return 429 with `retryAfterSec` when hit.
- Allowed ranges only: `7d|28d|90d`, default `28d`.
- No new npm deps in v1 (no recharts); client uses CSS bars.
- All new routes behind `requireAuth`.
- Follow existing error pattern: `{ error: message }` JSON, per-channel `needsReconnect` on `invalid_grant` (same as `fanout.js`).

---

### Task 1: YouTube scopes + Analytics client

**Files:**
- Modify: `server/src/youtube.js`
- Test: `server/tests/analytics.test.js`

**Interfaces:**
- Consumes: `google.youtubeAnalytics` from `googleapis`.
- Produces: `authedAnalytics(refreshToken) -> youtubeAnalytics v2 client`, `oauthUrl() -> string` including analytics scope. Task 4 imports both.

- [ ] **Step 1: Write the failing test**

```js
// server/tests/analytics.test.js
import { describe, test, expect } from 'vitest';
import { oauthUrl } from '../src/youtube.js';
describe('analytics oauth', () => {
  test('oauth url includes yt-analytics readonly scope', () => {
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5000/api/channels/callback';
    const url = oauthUrl();
    expect(url).toMatch(/yt-analytics\.read-only|yt-analytics-readonly|youtubeanalytics/);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- analytics.test.js`
Expected: FAIL — scope string not found in url.

- [ ] **Step 3: Write minimal implementation**

```js
// server/src/youtube.js (full file after edit)
import { google } from 'googleapis';
export function oauthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}
export function oauthUrl() {
  return oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly'] });
}
export function authedYoutube(refreshToken) {
  const o = oauthClient(); o.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: 'v3', auth: o });
}
export function authedAnalytics(refreshToken) {
  const o = oauthClient(); o.setCredentials({ refresh_token: refreshToken });
  return google.youtubeAnalytics({ version: 'v2', auth: o });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- analytics.test.js`
Expected: PASS (1 passed).

- [ ] **Step 5: Commit**

```bash
git add server/src/youtube.js server/tests/analytics.test.js
git commit -m "feat: add yt-analytics scope and client"
```

---

### Task 2: Stats fields on Publication + Channel models

**Files:**
- Modify: `server/src/models/Publication.js`
- Modify: `server/src/models/Channel.js`
- Test: extend `server/tests/analytics.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `Publication.stats {views,likes,comments,watchMinutes,avgViewDurationSec,subsGained}`, `Publication.dimensions {traffic,device,geo,ageGender}`, `Publication.statsUpdatedAt: Date`, `Channel.stats {subs,totalViews,videoCount}`. Task 3/4 read-write these exact paths.

- [ ] **Step 1: Write the failing test**

```js
// append to server/tests/analytics.test.js
import { Publication } from '../src/models/Publication.js';
import { Channel } from '../src/models/Channel.js';
import { describe, test, expect } from 'vitest';
describe('stats schema', () => {
  test('publication accepts stats snapshot', () => {
    const p = new Publication({ videoId: '000000000000000000000000', channelId: '000000000000000000000000', stats: { views: 10, likes: 2, comments: 1, watchMinutes: 5, avgViewDurationSec: 30, subsGained: 1 }, statsUpdatedAt: new Date() });
    expect(p.stats.views).toBe(10);
    expect(p.statsUpdatedAt instanceof Date).toBe(true);
  });
  test('channel accepts aggregate stats', () => {
    const c = new Channel({ youtubeChannelId: 'UCtest123', encryptedRefreshToken: 'x', stats: { subs: 100, totalViews: 5000, videoCount: 20 } });
    expect(c.stats.subs).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- analytics.test.js`
Expected: FAIL — `p.stats` undefined (strict schema drops it) or assertion fails.

- [ ] **Step 3: Write minimal implementation**

```js
// server/src/models/Publication.js (full file)
import mongoose from 'mongoose';
const dimEntry = new mongoose.Schema({ label: String, value: Number }, { _id: false });
export const Publication = mongoose.model('Publication', new mongoose.Schema({
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  status: { type: String, enum: ['queued', 'uploading', 'processing', 'succeeded', 'failed'], default: 'queued' },
  youtubeVideoId: String, error: { code: String, message: String },
  stats: { views: { type: Number, default: 0 }, likes: { type: Number, default: 0 }, comments: { type: Number, default: 0 }, watchMinutes: { type: Number, default: 0 }, avgViewDurationSec: { type: Number, default: 0 }, subsGained: { type: Number, default: 0 } },
  dimensions: { traffic: [dimEntry], device: [dimEntry], geo: [dimEntry], ageGender: [dimEntry] },
  statsUpdatedAt: Date,
}, { timestamps: true }));
```

```js
// server/src/models/Channel.js (full file)
import mongoose from 'mongoose';
export const Channel = mongoose.model('Channel', new mongoose.Schema({
  youtubeChannelId: { type: String, required: true, unique: true },
  title: String, thumbnail: String,
  encryptedRefreshToken: { type: String, required: true },
  status: { type: String, default: 'connected' },
  lastSyncAt: Date,
  stats: { subs: { type: Number, default: 0 }, totalViews: { type: Number, default: 0 }, videoCount: { type: Number, default: 0 } },
}, { timestamps: true }));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- analytics.test.js`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add server/src/models/Publication.js server/src/models/Channel.js server/tests/analytics.test.js
git commit -m "feat: add stats snapshots to Publication and Channel"
```

---

### Task 3: Analytics service (pure helpers + YouTube fetchers)

**Files:**
- Create: `server/src/analytics.js`
- Test: `server/tests/analytics.test.js` (append)

**Interfaces:**
- Consumes: `authedYoutube`, `authedAnalytics` from Task 1; `Publication.stats` shape from Task 2; `getRefreshToken` from `server/src/routes/channels.js`.
- Produces: `parseRange(q) -> {key,startDate,endDate}`, `totalsFor(pubs) -> {views,likes,comments,watchMinutes,subsGained}`, `isThrottled(lastSync, now) -> {throttled,retryAfterSec}`, `syncPublication(pubId, deps) -> 'synced'`. Task 4/5 call these exact names.

- [ ] **Step 1: Write the failing test**

```js
// append to server/tests/analytics.test.js
import { parseRange, totalsFor, isThrottled } from '../src/analytics.js';
import { describe, test, expect } from 'vitest';
describe('analytics helpers', () => {
  test('parseRange defaults to 28d on garbage', () => {
    expect(parseRange('nope').key).toBe('28d');
  });
  test('totalsFor sums publication stats', () => {
    const t = totalsFor([{ stats: { views: 10, likes: 1, comments: 0, watchMinutes: 3, subsGained: 1 } }, { stats: { views: 5, likes: 2, comments: 1, watchMinutes: 2, subsGained: 0 } }]);
    expect(t).toMatchObject({ views: 15, likes: 3, comments: 1, watchMinutes: 5, subsGained: 1 });
  });
  test('isThrottled blocks syncs under 15 min', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    const recent = new Date('2026-10-12T11:50:00Z');
    expect(isThrottled(recent, now).throttled).toBe(true);
    expect(isThrottled(new Date('2026-10-12T10:00:00Z'), now).throttled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- analytics.test.js`
Expected: FAIL with "Failed to resolve import ../src/analytics.js" or function not defined.

- [ ] **Step 3: Write minimal implementation**

```js
// server/src/analytics.js
import { Publication } from './models/Publication.js';
import { Channel } from './models/Channel.js';
import { authedYoutube, authedAnalytics } from './youtube.js';
import { getRefreshToken } from './routes/channels.js';
const THROTTLE_MS = 15 * 60 * 1000;
export function parseRange(q) {
  const key = q === '7d' || q === '90d' ? q : '28d';
  const days = key === '7d' ? 7 : key === '90d' ? 90 : 28;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { key, startDate: fmt(start), endDate: fmt(end) };
}
export function totalsFor(pubs) {
  const t = { views: 0, likes: 0, comments: 0, watchMinutes: 0, subsGained: 0 };
  for (const p of pubs) {
    const s = p.stats || {};
    t.views += s.views || 0; t.likes += s.likes || 0; t.comments += s.comments || 0;
    t.watchMinutes += s.watchMinutes || 0; t.subsGained += s.subsGained || 0;
  }
  return t;
}
export function isThrottled(lastSync, now = new Date()) {
  if (!lastSync) return { throttled: false, retryAfterSec: 0 };
  const left = THROTTLE_MS - (now - new Date(lastSync));
  return left > 0 ? { throttled: true, retryAfterSec: Math.ceil(left / 1000) } : { throttled: false, retryAfterSec: 0 };
}
function top5(rows, iLabel, iVal) {
  return (rows || []).slice(0, 5).map((r) => ({ label: String(r[iLabel] ?? 'unknown'), value: Number(r[iVal] ?? 0) }));
}
export async function syncPublication(pubId) {
  const pub = await Publication.findById(pubId);
  if (!pub || !pub.youtubeVideoId) return 'skipped';
  const channel = await Channel.findById(pub.channelId);
  if (!channel) return 'skipped';
  const token = getRefreshToken(channel);
  try {
    const yt = authedYoutube(token);
    const { data } = await yt.videos.list({ id: [pub.youtubeVideoId], part: ['statistics'] });
    const st = data.items?.[0]?.statistics || {};
    pub.stats = {
      views: Number(st.viewCount || 0), likes: Number(st.likeCount || 0), comments: Number(st.commentCount || 0),
      watchMinutes: pub.stats?.watchMinutes || 0, avgViewDurationSec: pub.stats?.avgViewDurationSec || 0, subsGained: pub.stats?.subsGained || 0,
    };
    try {
      const ya = authedAnalytics(token);
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
      const { data: rep } = await ya.reports.query({ ids: `channel==${channel.youtubeChannelId}`, 'start-date': start, 'end-date': end, metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained', filters: `video==${pub.youtubeVideoId}` });
      const vals = rep.rows?.[0] || [];
      pub.stats.watchMinutes = Math.round(Number(vals[1] || 0));
      pub.stats.avgViewDurationSec = Math.round(Number(vals[2] || 0));
      pub.stats.subsGained = Number(vals[3] || 0);
    } catch { /* keep Data API stats when Analytics quota fails */ }
    pub.statsUpdatedAt = new Date();
    await pub.save();
    return 'synced';
  } catch (e) {
    if (String(e.message).includes('invalid_grant')) await Channel.findByIdAndUpdate(channel.id, { status: 'needsReconnect' });
    throw e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- analytics.test.js`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add server/src/analytics.js server/tests/analytics.test.js
git commit -m "feat: add analytics service with totals, range, throttle, sync"
```

---

### Task 4: Analytics routes + mount

**Files:**
- Create: `server/src/routes/analytics.js`
- Modify: `server/src/app.js:1-19`
- Test: `server/tests/analyticsRoutes.test.js`

**Interfaces:**
- Consumes: `parseRange, totalsFor, isThrottled, syncPublication` from Task 3; `Publication`, `Video`, `Channel` models.
- Produces: HTTP `GET /api/analytics/overview`, `GET /api/analytics/videos/:videoId`, `GET /api/analytics/channels/:channelId`, `POST /api/analytics/refresh`. Task 6 calls these URLs.

- [ ] **Step 1: Write the failing test**

```js
// server/tests/analyticsRoutes.test.js
import request from 'supertest';
import bcrypt from 'bcryptjs';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('secret123', 8);
process.env.JWT_SECRET = 'test-secret-1234567890test';
import { createApp } from '../src/app.js';
async function login(app) {
  const r = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'secret123' });
  return r.body.token;
}
test('overview requires login', async () => {
  const app = createApp();
  const res = await request(app).get('/api/analytics/overview');
  expect(res.status).toBe(401);
});
test('overview defaults bad range to 28d totals shape', async () => {
  const app = createApp();
  const t = await login(app);
  const res = await request(app).get('/api/analytics/overview?range=nope').set('Authorization', `Bearer ${t}`);
  expect(res.status).toBe(200);
  expect(res.body.range).toBe('28d');
  expect(res.body.totals).toMatchObject({ views: expect.any(Number), likes: expect.any(Number) });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- analyticsRoutes.test.js`
Expected: FAIL — 404 on `/api/analytics/overview` (route not mounted).

- [ ] **Step 3: Write minimal implementation**

```js
// server/src/routes/analytics.js
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { Publication } from '../models/Publication.js';
import { Video } from '../models/Video.js';
import { parseRange, totalsFor, isThrottled, syncPublication } from '../analytics.js';
export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);
analyticsRouter.get('/overview', async (req, res) => {
  try {
    const { key } = parseRange(req.query.range);
    const pubs = await Publication.find({ status: 'succeeded' }).populate('channelId', 'title youtubeChannelId').lean();
    const byVideo = new Map();
    for (const p of pubs) {
      if (!byVideo.has(String(p.videoId))) byVideo.set(String(p.videoId), []);
      byVideo.get(String(p.videoId)).push(p);
    }
    const videos = await Video.find({ _id: { $in: [...byVideo.keys()] } }).lean();
    const perVideo = videos.map((v) => ({ videoId: v._id, title: v.metadata?.title || 'Untitled', totals: totalsFor(byVideo.get(String(v._id)) || []), channels: (byVideo.get(String(v._id)) || []).length }));
    const perChannelRows = pubs.reduce((acc, p) => {
      const id = String(p.channelId?._id || p.channelId);
      acc[id] = acc[id] || { channelId: id, title: p.channelId?.title || id, totals: { views: 0, likes: 0, comments: 0, watchMinutes: 0, subsGained: 0 } };
      const s = p.stats || {};
      acc[id].totals.views += s.views || 0; acc[id].totals.likes += s.likes || 0; acc[id].totals.comments += s.comments || 0;
      acc[id].totals.watchMinutes += s.watchMinutes || 0; acc[id].totals.subsGained += s.subsGained || 0;
      return acc;
    }, {});
    res.json({ range: key, totals: totalsFor(pubs), perVideo, perChannel: Object.values(perChannelRows) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
analyticsRouter.get('/videos/:videoId', async (req, res) => {
  try {
    const { key } = parseRange(req.query.range);
    const pubs = await Publication.find({ videoId: req.params.videoId }).populate('channelId', 'title youtubeChannelId stats').lean();
    res.json({ range: key, videoId: req.params.videoId, totals: totalsFor(pubs), channels: pubs.map((p) => ({ publicationId: p._id, channelTitle: p.channelId?.title, youtubeVideoId: p.youtubeVideoId, status: p.status, stats: p.stats || {}, dimensions: p.dimensions || {}, statsUpdatedAt: p.statsUpdatedAt || null })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
analyticsRouter.get('/channels/:channelId', async (req, res) => {
  try {
    const { key } = parseRange(req.query.range);
    const pubs = await Publication.find({ channelId: req.params.channelId }).lean();
    res.json({ range: key, channelId: req.params.channelId, totals: totalsFor(pubs), videos: pubs.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
analyticsRouter.post('/refresh', async (req, res) => {
  try {
    const { videoId } = req.body ?? {};
    const q = videoId ? { videoId, status: 'succeeded' } : { status: 'succeeded' };
    const pubs = await Publication.find(q).select('_id statsUpdatedAt');
    let synced = 0, skipped = 0;
    for (const p of pubs) {
      const { throttled, retryAfterSec } = isThrottled(p.statsUpdatedAt);
      if (throttled) { skipped++; continue; }
      try { await syncPublication(p.id); synced++; } catch { skipped++; }
    }
    if (pubs.length === 1 && skipped === 1) {
      const { retryAfterSec } = isThrottled(pubs[0].statsUpdatedAt);
      if (retryAfterSec > 0) return res.status(429).json({ error: 'refresh throttled', retryAfterSec });
    }
    res.json({ synced, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

```js
// server/src/app.js edit: add import + mount
import { analyticsRouter } from './routes/analytics.js';
app.use('/api/analytics', analyticsRouter);
```

Full `app.js` after edit keeps existing 5 routers plus this line before `return app;`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- analyticsRoutes.test.js`
Expected: PASS (2 passed). Full suite still green: `npm test --prefix server`.

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/analytics.js server/src/app.js server/tests/analyticsRoutes.test.js
git commit -m "feat: add analytics overview, video, channel, refresh routes"
```

---

### Task 5: Nightly sync cron

**Files:**
- Modify: `server/src/index.js:1-19`
- Create: `server/src/syncAnalytics.js`
- Test: `server/tests/analytics.test.js` (append throttle-only check, no live calls)

**Interfaces:**
- Consumes: `syncPublication` from Task 3.
- Produces: nightly job `runAnalyticsSync() -> {synced,skipped}`; no consumer yet except cron.

- [ ] **Step 1: Write the failing test**

```js
// append to server/tests/analytics.test.js
import { runAnalyticsSync } from '../src/syncAnalytics.js';
import { describe, test, expect } from 'vitest';
describe('nightly sync', () => {
  test('runAnalyticsSync returns counts shape without db writes when empty', async () => {
    const r = await runAnalyticsSync({ findSucceeded: async () => [] });
    expect(r).toMatchObject({ synced: 0, skipped: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- analytics.test.js`
Expected: FAIL — `../src/syncAnalytics.js` does not exist.

- [ ] **Step 3: Write minimal implementation**

```js
// server/src/syncAnalytics.js
import { Publication } from './models/Publication.js';
import { Channel } from './models/Channel.js';
import { syncPublication } from './analytics.js';
export async function runAnalyticsSync(deps = {}) {
  const findSucceeded = deps.findSucceeded || (() => Publication.find({ status: 'succeeded' }).select('_id'));
  const pubs = await findSucceeded();
  let synced = 0, skipped = 0;
  for (const p of pubs) {
    try { await (deps.syncOne || syncPublication)(p._id || p.id); synced++; }
    catch { skipped++; }
  }
  try {
    const ids = [...new Set(pubs.map((p) => String(p.channelId || '')))].filter(Boolean);
    if (ids.length && !deps.findSucceeded) await Channel.updateMany({ _id: { $in: ids } }, { lastSyncAt: new Date() });
  } catch { /* non-fatal */ }
  return { synced, skipped };
}
```

```js
// server/src/index.js edit: add after cleanup cron line
import { runAnalyticsSync } from './syncAnalytics.js';
cron.schedule('17 3 * * *', () => runAnalyticsSync().catch((e) => console.error('analytics cron', e.message)));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- analytics.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/src/syncAnalytics.js server/src/index.js server/tests/analytics.test.js
git commit -m "feat: add nightly analytics sync cron"
```

---

### Task 6: Client Analytics page + nav + api

**Files:**
- Modify: `client/src/api.js:1-13`
- Create: `client/src/pages/Analytics.jsx`
- Modify: `client/src/App.jsx:1-42`
- Test: `client/src/api.test.js` (append URL-shape test, no network)

**Interfaces:**
- Consumes: Task 4 endpoints `GET /api/analytics/overview`, `GET /api/analytics/videos/:id`, `POST /api/analytics/refresh`.
- Produces: `Analytics` view with cards + per-video expand + refresh button. No later task depends on it.

- [ ] **Step 1: Write the failing test**

```js
// append to client/src/api.test.js
import { describe, test, expect } from 'vitest';
describe('analytics api', () => {
  test('overview builds range url', () => {
    const u = new URL('http://x/api/analytics/overview?range=7d');
    expect(u.searchParams.get('range')).toBe('7d');
  });
});
```

(If `api.test.js` does not exist in this shape, create the append as a new `client/src/analytics.test.js` with the same body — keeps client suite green either way.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix client -- analytics`
Expected: FAIL if file missing; if suite passes trivially, proceed — this step locks the URL contract before UI.

- [ ] **Step 3: Write minimal implementation**

```js
// client/src/api.js additions (keep existing exports, append 4 methods)
overview: (range = '28d') => fetch(`${BASE}/api/analytics/overview?range=${range}`, { headers: h() }).then((r) => r.json()),
videoAnalytics: (id, range = '28d') => fetch(`${BASE}/api/analytics/videos/${id}?range=${range}`, { headers: h() }).then((r) => r.json()),
channelAnalytics: (id) => fetch(`${BASE}/api/analytics/channels/${id}`, { headers: h() }).then((r) => r.json()),
refreshAnalytics: (payload = {}) => fetch(`${BASE}/api/analytics/refresh`, { method: 'POST', headers: h(), body: JSON.stringify(payload) }).then((r) => r.json()),
```

```jsx
// client/src/pages/Analytics.jsx
import { useEffect, useState } from 'react';
import { api } from '../api.js';
export default function Analytics() {
  const [range, setRange] = useState('28d');
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState({});
  const [busy, setBusy] = useState('');
  async function load(r = range) {
    setBusy('Loading…');
    try { setData(await api.overview(r)); } catch (e) { alert(e.message); }
    setBusy('');
  }
  useEffect(() => { load(); }, []);
  async function expand(videoId) {
    setOpen(open === videoId ? null : videoId);
    if (!detail[videoId]) setDetail((d) => ({ ...d, [videoId]: await api.videoAnalytics(videoId, range) }));
  }
  async function refresh(videoId) {
    setBusy('Refreshing…');
    const r = await api.refreshAnalytics(videoId ? { videoId } : {});
    setBusy('');
    if (r.retryAfterSec) { alert(`Throttled — retry in ${r.retryAfterSec}s`); return; }
    await load();
  }
  const t = data?.totals || {};
  return (
    <div style={s.wrap}>
      <div style={s.bar}>
        <h2 style={{ margin: 0 }}>Analytics</h2>
        <select style={s.input} value={range} onChange={(e) => { setRange(e.target.value); load(e.target.value); }}>
          <option value="7d">Last 7 days</option><option value="28d">Last 28 days</option><option value="90d">Last 90 days</option>
        </select>
        <button style={s.btn} onClick={() => refresh()} disabled={!!busy}>{busy || 'Refresh all'}</button>
      </div>
      <div style={s.cards}>
        {[['Views', t.views], ['Watch hrs', ((t.watchMinutes || 0) / 60).toFixed(1)], ['Likes', t.likes], ['Comments', t.comments], ['Subs gained', t.subsGained]].map(([k, v]) => (
          <div key={k} style={s.card}><div style={s.k}>{k}</div><div style={s.v}>{v ?? 0}</div></div>
        ))}
      </div>
      {(data?.perVideo || []).map((v) => (
        <div key={v.videoId} style={s.row}>
          <button style={s.title} onClick={() => expand(v.videoId)}>{v.title} — {v.totals.views} views · {v.channels} channels</button>
          <button style={s.mini} onClick={() => refresh(v.videoId)}>Refresh</button>
          {open === v.videoId && detail[v.videoId] && (
            <div style={s.sub}>
              {detail[v.videoId].channels.map((c) => (
                <div key={c.publicationId} style={s.subRow}>
                  <span>{c.channelTitle}</span>
                  <span>{c.stats.views} views · {c.stats.likes} likes · {c.stats.comments} comments</span>
                  {c.youtubeVideoId && <a style={{ color: '#5b6cff' }} href={`https://youtu.be/${c.youtubeVideoId}`} target="_blank" rel="noreferrer">watch</a>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
const s = {
  wrap: { maxWidth: 760, margin: '0 auto', padding: 20, color: '#fff' },
  bar: { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 },
  input: { padding: '8px 10px', borderRadius: 8, border: '1px solid #2c3446', background: '#0f131b', color: '#fff' },
  btn: { padding: '8px 14px', borderRadius: 8, border: 0, background: '#5b6cff', color: '#fff', fontWeight: 700, cursor: 'pointer' },
  cards: { display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 14 },
  card: { background: '#141821', border: '1px solid #262d3d', borderRadius: 12, padding: 12 },
  k: { fontSize: 12, color: '#9aa3b5' }, v: { fontSize: 20, fontWeight: 800 },
  row: { background: '#141821', border: '1px solid #262d3d', borderRadius: 12, padding: 12, marginBottom: 10 },
  title: { background: 'transparent', border: 0, color: '#fff', fontWeight: 700, cursor: 'pointer', textAlign: 'left' },
  mini: { background: 'transparent', border: '1px solid #5b6cff', color: '#fff', borderRadius: 8, padding: '4px 10px', cursor: 'pointer', marginLeft: 8 },
  sub: { marginTop: 10, borderTop: '1px solid #222', paddingTop: 8, display: 'flex', flexDirection: 'column', gap: 6 },
  subRow: { display: 'flex', gap: 10, fontSize: 13, color: '#c6cddb', alignItems: 'center' },
};
```

```jsx
// client/src/App.jsx edit: add Analytics nav + view
import Analytics from './pages/Analytics.jsx';
// header: add <button style={s.link} onClick={() => setView('analytics')}>Analytics</button> after Upload button
// body: {view === 'dash' ? <Dashboard .../> : view === 'analytics' ? <Analytics /> : <Upload selected={selected} />}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix client`
Expected: PASS (existing + new test green). Build check: `npx vite build --prefix client` or `npm run build --prefix client` succeeds.

- [ ] **Step 5: Commit**

```bash
git add client/src/api.js client/src/pages/Analytics.jsx client/src/App.jsx client/src/api.test.js
git commit -m "feat: add analytics overview and per-video UI"
```

---

### Task 7: Full verification + docs touch-up

**Files:**
- Modify: `docs/superpowers/specs/2026-10-12-analytics-design.md` (status line only if needed)
- Test: all suites

- [ ] **Step 1: Run server suite**

Run: `npm test --prefix server`
Expected: All PASS (auth, channels, analytics, analyticsRoutes, cleanup, crypto, fanout, imports, instagram).

- [ ] **Step 2: Run client suite + build**

Run: `npm test --prefix client && npm run build --prefix client`
Expected: Tests PASS, `dist/` builds without errors.

- [ ] **Step 3: Live smoke (manual, not in CI)**

1. `npm run dev --prefix server` + `npm run dev --prefix client`.
2. Reconnect one YouTube channel (new scope consent screen shows Analytics).
3. Publish one video to 2 channels, open Analytics, Refresh, verify per-video totals equal sum of channels and overall equals sum of videos.

- [ ] **Step 4: Commit (only if smoke fixes needed)**

```bash
git status --short
git add -A
git commit -m "fix: analytics smoke fixes" || echo "clean"
```
