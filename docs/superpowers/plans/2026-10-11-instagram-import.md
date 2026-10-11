# Instagram Reel Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Paste an Instagram reel link and automatically publish it to every connected YouTube channel.

**Architecture:** New ingest path reusing the existing pipeline. `server/src/instagram.js` holds pure URL/caption helpers; `server/src/routes/imports.js` downloads the reel with `yt-dlp-exec`, uploads it to Cloudinary exactly like the manual upload, creates a `Video` doc plus one `Publication` per connected channel, and kicks off the existing `fanout`. The Upload page gets an import box that reuses the existing per-channel status list.

**Tech Stack:** Node 20, Express, `yt-dlp-exec` (npm wrapper that downloads the yt-dlp binary at install time), Cloudinary, Mongoose, React, Vitest + Supertest.

## Global Constraints

- Reels only: only `instagram.com/reel/` links are accepted.
- Fully automatic: no review step; all connected channels every time.
- Title from caption first line (max 100 chars, fallback `Instagram reel <id>`); description is full caption plus source link; privacy is `public`.
- TDD: failing test first for every unit; yt-dlp binary itself verified live, not unit-tested.
- Every task ends with a commit; push only at the very end.

---

## File Structure

- Create `server/src/instagram.js` — pure helpers `isReelUrl(url)`, `reelId(url)`, `titleFromCaption(caption, reelId)`. No imports except nothing. Used by the imports route.
- Create `server/tests/instagram.test.js` — unit tests for the helpers.
- Create `server/src/routes/imports.js` — `POST /api/imports/instagram` behind `requireAuth`. Consumes `instagram.js`, `yt-dlp-exec`, `Channel`, `Video`, `Publication`, `fanout`, `cloudinary`, `expiryDate`.
- Create `server/tests/imports.test.js` — auth/validation tests against the real app; `Channel` model mocked only for the empty-channels case (no Mongo in tests).
- Modify `server/src/app.js` — mount `importsRouter` at `/api/imports`.
- Modify `server/package.json` — add `yt-dlp-exec` via `npm install yt-dlp-exec` in `server/`.
- Modify `client/src/api.js` — add `importReel(url)`.
- Modify `client/src/pages/Upload.jsx` — import box reusing the status list.

---

### Task 1: Reel URL and caption helpers

**Files:**
- Create: `server/src/instagram.js`
- Test: `server/tests/instagram.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `isReelUrl(url)` → normalized `https://www.instagram.com/reel/<id>/` string or `null`; `reelId(url)` → id string or `null`; `titleFromCaption(caption, reelId)` → string. Used by Task 2.

- [ ] **Step 1: Write the failing test**

```js
import { isReelUrl, reelId, titleFromCaption } from '../src/instagram.js';
test('accepts reel links in any shape', () => {
  expect(isReelUrl('https://www.instagram.com/reel/ABC123xyz_-/')).toBe('https://www.instagram.com/reel/ABC123xyz_-/');
  expect(isReelUrl('http://instagram.com/reel/ABC123xyz_-?utm_source=ig')).toBe('https://www.instagram.com/reel/ABC123xyz_-/');
});
test('rejects non-reel links', () => {
  expect(isReelUrl('https://www.instagram.com/p/ABC123/')).toBeNull();
  expect(isReelUrl('https://www.youtube.com/watch?v=x')).toBeNull();
  expect(isReelUrl('not a url')).toBeNull();
  expect(isReelUrl('')).toBeNull();
});
test('extracts reel id', () => {
  expect(reelId('https://www.instagram.com/reel/ABC123xyz_-/')).toBe('ABC123xyz_-');
  expect(reelId('https://www.instagram.com/p/ABC/')).toBeNull();
});
test('derives title from caption', () => {
  expect(titleFromCaption('My title\nsecond line', 'ID1')).toBe('My title');
  expect(titleFromCaption('  \n  fallen back  ', 'ID1')).toBe('fallen back');
  expect(titleFromCaption('', 'ID1')).toBe('Instagram reel ID1');
  expect(titleFromCaption('x'.repeat(200), 'ID1')).toBe('x'.repeat(100));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/instagram.test.js` in `server/`
Expected: FAIL with "Failed to load url ./instagram.js ... Does the file exist?"

- [ ] **Step 3: Write minimal implementation**

```js
const REEL_RE = /^https?:\/\/(www\.)?instagram\.com\/reel\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/;
export function reelId(url) {
  const m = String(url || '').trim().match(REEL_RE);
  return m ? m[2] : null;
}
export function isReelUrl(url) {
  const id = reelId(url);
  return id ? `https://www.instagram.com/reel/${id}/` : null;
}
export function titleFromCaption(caption, rid) {
  const first = String(caption || '').split('\n').map((l) => l.trim()).find((l) => l);
  if (!first) return `Instagram reel ${rid}`;
  return first.slice(0, 100);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/instagram.test.js` in `server/`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/src/instagram.js server/tests/instagram.test.js
git commit -m "feat: reel URL and caption helpers"
```

---

### Task 2: Imports route with validation (no download yet)

**Files:**
- Create: `server/src/routes/imports.js` (skeleton: auth + URL validation + empty-channels guard; download added in Task 3)
- Test: `server/tests/imports.test.js`
- Modify: `server/src/app.js` (mount router)

**Interfaces:**
- Consumes: `isReelUrl` from Task 1; `requireAuth` from `server/src/auth.js`; `Channel` model.
- Produces: `importsRouter` mounted at `/api/imports` in `app.js`; `POST /api/imports/instagram` returning 400 for bad input. Task 3 fills in the download/upload/publish body.

- [ ] **Step 1: Mount the router in app.js (needed for route tests)**

In `server/src/app.js`, add the import and mount line:

```js
import { importsRouter } from './routes/imports.js';
```

```js
app.use('/api/imports', importsRouter);
```

Place the import with the other router imports and the mount line with the other `app.use('/api/...')` lines.

- [ ] **Step 2: Write the failing test**

```js
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';
process.env.ADMIN_EMAIL = 'import@test.com';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('secret123', 8);
process.env.JWT_SECRET = 'test-secret-1234567890test';
vi.mock('../src/models/Channel.js', () => ({ Channel: { find: async () => [] } }));
import { createApp } from '../src/app.js';

async function login(app) {
  const r = await request(app).post('/api/auth/login').send({ email: 'import@test.com', password: 'secret123' });
  return r.body.token;
}
test('import requires login', async () => {
  const app = createApp();
  const res = await request(app).post('/api/imports/instagram').send({ url: 'https://www.instagram.com/reel/ABC123/' });
  expect(res.status).toBe(401);
});
test('import rejects non-reel urls', async () => {
  const app = createApp();
  const t = await login(app);
  const res = await request(app).post('/api/imports/instagram').set('Authorization', `Bearer ${t}`).send({ url: 'https://www.instagram.com/p/ABC123/' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/reel/i);
});
test('import rejects when no channels connected', async () => {
  const app = createApp();
  const t = await login(app);
  const res = await request(app).post('/api/imports/instagram').set('Authorization', `Bearer ${t}`).send({ url: 'https://www.instagram.com/reel/ABC123/' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/no.*channel/i);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/imports.test.js` in `server/`
Expected: FAIL — 404 on POST (no route yet).

- [ ] **Step 4: Write minimal route skeleton**

```js
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { Channel } from '../models/Channel.js';
import { isReelUrl } from '../instagram.js';
export const importsRouter = Router();
importsRouter.use(requireAuth);
importsRouter.post('/instagram', async (req, res) => {
  try {
    const normalized = isReelUrl(req.body?.url);
    if (!normalized) return res.status(400).json({ error: 'a valid instagram reel link is required' });
    const channels = await Channel.find().select('_id');
    if (!channels.length) return res.status(400).json({ error: 'no connected channels — connect a channel first' });
    return res.status(500).json({ error: 'not implemented' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/imports.test.js` in `server/`
Expected: PASS, 3 tests. (The success path does not exist yet, so no test can reach the 500 stub.)

- [ ] **Step 6: Commit**

```bash
git add server/src/app.js server/src/routes/imports.js server/tests/imports.test.js
git commit -m "feat: instagram import route skeleton with validation"
```

---

### Task 3: Download, Cloudinary upload, publish-all

**Files:**
- Modify: `server/src/routes/imports.js` (replace the 500 stub)
- Modify: `server/package.json` (add `yt-dlp-exec`)

**Interfaces:**
- Consumes: `isReelUrl`, `reelId`, `titleFromCaption` from Task 1; `Video`, `Publication`, `Channel` models; `fanout` from `server/src/fanout.js`; `expiryDate` from `server/src/cleanup.js`; `cloudinary` uploader (same pattern as `server/src/routes/videos.js`).
- Produces: `POST /api/imports/instagram` returns `{ videoId, url }` and fans out to all channels. Consumed by Task 4.

- [ ] **Step 1: Install yt-dlp-exec**

Run: `npm install yt-dlp-exec` in `server/`
Expected: `server/package.json` gains `yt-dlp-exec`; postinstall downloads the yt-dlp binary (needs network; ~30 MB). Verify with `npx yt-dlp --version` if a bin link exists, otherwise continue — first use downloads on demand.

- [ ] **Step 2: Replace the stub with the full handler**

Replace `return res.status(500).json({ error: 'not implemented' });` with:

```js
    const ytdlp = (await import('yt-dlp-exec')).default;
    const stamp = Date.now();
    let meta = {};
    try {
      meta = JSON.parse(await ytdlp(normalized, { dumpSingleJson: true, noWarnings: true }));
    } catch (e) { return res.status(502).json({ error: `could not read reel (private, deleted, or rate-limited): ${String(e.message || e).slice(0, 200)}` }); }
    const caption = meta.description || meta.title || '';
    const title = titleFromCaption(caption, reelId(normalized));
    const prefix = `reel-${stamp}-`;
    let file;
    try {
      await ytdlp(normalized, { output: `${os.tmpdir()}/${prefix}%(ext)s`, format: 'mp4/best/b', noWarnings: true });
      file = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith(prefix)).map((f) => `${os.tmpdir()}/${f}`)[0];
      if (!file) throw new Error('download produced no file');
    } catch (e) { return res.status(502).json({ error: `could not download reel: ${String(e.message || e).slice(0, 200)}` }); }
    try {
      const done = await new Promise((resolve, reject) => {
        const s = cloudinary.uploader.upload_stream({ resource_type: 'video' }, (e, r) => e ? reject(e) : resolve(r));
        fs.createReadStream(file).pipe(s);
      });
      const v = await Video.create({
        cloudinaryUrl: done.secure_url, cloudinaryPublicId: done.public_id, cloudinaryExpiresAt: expiryDate(),
        metadata: { title, description: `${caption}\n\nSource: ${normalized}`.trim(), tags: [], privacy: 'public' },
      });
      const docs = await Publication.insertMany(channels.map((c) => ({ videoId: v.id, channelId: c._id, status: 'queued' })));
      fanout(docs.map((d) => d.id));
      res.json({ videoId: v.id, url: v.cloudinaryUrl });
    } finally { fs.unlink(file, () => {}); }
```

Add imports at the top of the file: `fs`, `os`, `cloudinary`, `Video`, `Publication`, `fanout`, `reelId`, `titleFromCaption`, `expiryDate`:

```js
import fs from 'node:fs';
import os from 'node:os';
import { v2 as cloudinary } from 'cloudinary';
import { Video } from '../models/Video.js';
import { Publication } from '../models/Publication.js';
import { fanout } from '../fanout.js';
import { expiryDate } from '../cleanup.js';
import { isReelUrl, reelId, titleFromCaption } from '../instagram.js';
```

- [ ] **Step 3: Run the full server suite**

Run: `npx vitest run` in `server/`
Expected: all files pass (imports tests still pass; nothing reaches the network without Mongo + channels).

- [ ] **Step 4: Live-verify with a real public reel**

With the local backend running (`node src/index.js` in `server/` with the existing `server/.env`), fill in the three values below — `ADMIN_EMAIL` from `server/.env`, the admin password you log in with, and any public reel link — then run:

```bash
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"<ADMIN_EMAIL>","password":"<ADMIN_PASSWORD>"}' | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
curl -s -X POST http://localhost:5000/api/imports/instagram -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' -d '{"url":"<PUBLIC_REEL_URL>"}'
```

Expected: `{ "videoId": "...", "url": "https://res.cloudinary.com/..." }`. If yt-dlp fails on the chosen reel, try another public reel; only change code if the failure is in our code (not the binary/network).

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/imports.js server/package.json server/package-lock.json
git commit -m "feat: download reel, upload to Cloudinary, publish to all channels"
```

---

### Task 4: Client import box

**Files:**
- Modify: `client/src/api.js` (add `importReel`)
- Modify: `client/src/pages/Upload.jsx` (import box)

**Interfaces:**
- Consumes: `POST /api/imports/instagram` from Task 3 returning `{ videoId, url }`; existing `api.pubs(videoId)` status polling already in `Upload.jsx`.
- Produces: visible import box; nothing downstream.

- [ ] **Step 1: Add the api method**

In `client/src/api.js`, add to the `api` object:

```js
importReel: (url) => fetch(`${BASE}/api/imports/instagram`, { method: 'POST', headers: h(), body: JSON.stringify({ url }) }).then((r) => r.json()),
```

- [ ] **Step 2: Add the import box to Upload.jsx**

At the top of the component add state:

```js
const [link, setLink] = useState('');
```

Add this box above the existing `{!video ? (` block:

```jsx
<div style={s.card}>
  <input style={s.input} placeholder="Paste Instagram reel link…" value={link} onChange={(e) => setLink(e.target.value)} />
  <button style={s.btn} onClick={async () => {
    if (!link) return;
    setBusy('Fetching reel…');
    try {
      const r = await api.importReel(link);
      if (!r.videoId) { alert(r.error || 'import failed'); return; }
      setVideo({ videoId: r.videoId, url: r.url });
      setLink('');
      const tick = async () => setPubs(await api.pubs(r.videoId));
      await tick();
      const iv = setInterval(async () => {
        const list = await api.pubs(r.videoId);
        setPubs(list);
        if (list.length && list.every((p) => ['succeeded', 'failed'].includes(p.status))) clearInterval(iv);
      }, 5000);
    } finally { setBusy(''); }
  }} disabled={busy}>{busy || 'Import & publish to all channels'}</button>
</div>
```

- [ ] **Step 3: Run client suite + GUI check**

Run: `npx vitest run` in `client/`
Expected: all pass (no new unit tests; box verified visually).
Then with both servers running, open the app, paste a public reel link, and confirm the video preview plus per-channel status list appear.

- [ ] **Step 4: Commit**

```bash
git add client/src/api.js client/src/pages/Upload.jsx
git commit -m "feat: Instagram reel import box on Upload page"
```

---

### Task 5: Ship it

**Files:** none (verification + push).

- [ ] **Step 1: Run both suites one final time**

Run: `npx vitest run` in `server/` — Expected: all pass.
Run: `npx vitest run` in `client/` — Expected: all pass.

- [ ] **Step 2: Push (Render redeploys backend)**

```bash
git push origin main
```

Expected: `main -> main`. Note: Render rebuild runs `npm install`, which downloads the yt-dlp binary via postinstall — the first production import may take longer (cold binary + cold instance).

- [ ] **Step 3: Production GUI verification**

Open the deployed Vercel frontend, paste a public reel link, and confirm the status list shows per-channel progress to `succeeded`. If yt-dlp is blocked on Render's network, the import returns a 502 with the reason — that outcome also completes this task (report it, do not add workarounds in this task).
