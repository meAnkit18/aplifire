# Amplifier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build personal YouTube multi-channel distribution platform with visual node dashboard (upload once → publish to N channels).

**Architecture:** Central Express backend orchestrates Cloudinary staging (1h TTL) and per-channel YouTube Data API v3 fan-out; Vite+React Flow frontend on Vercel polls per-channel publication status.

**Tech Stack:** MongoDB Atlas + Mongoose, Express 4 + googleapis + cloudinary + node-cron, Vite + React 18 + React Flow + Tailwind, JWT auth, AES-256-GCM token encryption.

## Global Constraints
- Same metadata (title/description/tags/privacy) applied to all selected channels.
- Cloudinary asset must auto-delete 1 hour after upload (expiresAt + cron every 10 min).
- Single hardcoded user via ADMIN_EMAIL + ADMIN_PASSWORD_HASH (.env), JWT 7d.
- Canvas is visual control-center only (React Flow drag/edges/click), no workflow execution.
- Frontend: `client/` → Vercel, Backend: `server/` → Render. `VITE_API_URL` + `FRONTEND_URL` CORS pairing.
- Google OAuth scopes: `youtube.upload youtube.readonly`.

---

### Task 1: Monorepo scaffold + shared config

**Files:**
- Create: `server/package.json`
- Create: `server/src/index.js`
- Create: `server/src/config.js`
- Create: `client/package.json`
- Create: `.gitignore`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `config` object `{mongoUri, jwtSecret, adminEmail, adminPasswordHash, cloudinary{...}, google{...}, frontendUrl, port}` consumed by Tasks 2-5; running `server/src/index.js` health endpoint consumed by frontend.

- [ ] **Step 1: Write failing backend health test**

```js
// server/tests/health.test.js
import request from 'supertest';
import { createApp } from '../src/app.js';
test('GET /api/health returns ok', async () => {
  const app = createApp();
  const res = await request(app).get('/api/health');
  expect(res.status).toBe(200);
  expect(res.body.ok).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- tests/health.test.js`
Expected: FAIL "Cannot find module '../src/app.js'"

- [ ] **Step 3: Minimal implementation**

```js
// server/src/app.js
import express from 'express';
import cors from 'cors';
export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') ?? true }));
  app.use(express.json({ limit: '10mb' }));
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  return app;
}
```

```js
// server/src/config.js
export const config = {
  port: process.env.PORT || 5000,
  mongoUri: process.env.MONGO_URI || '',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@local',
  adminPasswordHash: process.env.ADMIN_PASSWORD_HASH || '',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  tokenKey: process.env.TOKEN_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef',
};
```

```js
// server/src/index.js
import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app.js';
import { config } from './config.js';
const app = createApp();
if (config.mongoUri) await mongoose.connect(config.mongoUri);
app.listen(config.port, () => console.log(`api:${config.port}`));
```

`server/package.json` deps: `express cors dotenv mongoose jsonwebtoken bcryptjs googleapis cloudinary multer node-cron`, dev: `supertest vitest`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- tests/health.test.js`
Expected: PASS 1 test

- [ ] **Step 5: Commit**

```bash
git add server/package.json server/src/index.js server/src/app.js server/src/config.js server/tests/health.test.js .gitignore
git commit -m "feat: scaffold monorepo with health check"
```

### Task 2: Single-user auth (login + JWT middleware)

**Files:**
- Create: `server/src/auth.js`
- Create: `server/src/routes/auth.js`
- Test: `server/tests/auth.test.js`
- Modify: `server/src/app.js:1-20` (mount auth router)

**Interfaces:**
- Consumes: `config.adminEmail/adminPasswordHash/jwtSecret` from Task 1.
- Produces: `POST /api/auth/login {email,password} → {token}`, `requireAuth(req,res,next)` middleware used by Tasks 3-5.

- [ ] **Step 1: Write failing test**

```js
// server/tests/auth.test.js
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
process.env.ADMIN_EMAIL = 'me@test.com';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('secret123', 8);
process.env.JWT_SECRET = 'test-secret-1234567890';
test('login succeeds + rejects bad password', async () => {
  const app = (await import('../src/app.js')).createApp();
  const ok = await request(app).post('/api/auth/login').send({ email: 'me@test.com', password: 'secret123' });
  expect(ok.status).toBe(200); expect(ok.body.token).toBeTruthy();
  const bad = await request(app).post('/api/auth/login').send({ email: 'me@test.com', password: 'nope' });
  expect(bad.status).toBe(401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- tests/auth.test.js`
Expected: FAIL 404 (no route)

- [ ] **Step 3: Minimal implementation**

```js
// server/src/auth.js
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
export async function verifyAdmin(email, password) {
  if (email !== (process.env.ADMIN_EMAIL || config.adminEmail)) return false;
  const hash = process.env.ADMIN_PASSWORD_HASH || config.adminPasswordHash;
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
export function signToken() { return jwt.sign({ sub: 'admin' }, process.env.JWT_SECRET || config.jwtSecret, { expiresIn: '7d' }); }
export function requireAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try { jwt.verify(token, process.env.JWT_SECRET || config.jwtSecret); next(); }
  catch { return res.status(401).json({ error: 'invalid token' }); }
}
```

```js
// server/src/routes/auth.js
import { Router } from 'express';
import { verifyAdmin, signToken } from '../auth.js';
export const authRouter = Router();
authRouter.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'email+password required' });
  if (!(await verifyAdmin(email, password))) return res.status(401).json({ error: 'invalid credentials' });
  res.json({ token: signToken() });
});
```

Mount in `app.js`: `import { authRouter } from './routes/auth.js'; app.use('/api/auth', authRouter);`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- tests/auth.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/auth.js server/src/routes/auth.js server/src/app.js server/tests/auth.test.js
git commit -m "feat: single-user JWT login"
```

### Task 3: Channels + Google OAuth + encrypted refresh tokens

**Files:**
- Create: `server/src/crypto.js`
- Create: `server/src/models/Channel.js`
- Create: `server/src/youtube.js`
- Create: `server/src/routes/channels.js`
- Test: `server/tests/crypto.test.js`

**Interfaces:**
- Consumes: `requireAuth` (Task 2), `config.google` (Task 1).
- Produces: `GET /api/channels`, `GET /api/channels/oauth-url`, `GET /api/channels/callback?code=`, `DELETE /api/channels/:id`, `getOAuthClient(refreshToken)` used by Task 5.

- [ ] **Step 1: Write failing test (encryption round-trip)**

```js
// server/tests/crypto.test.js
import { encrypt, decrypt } from '../src/crypto.js';
test('refresh token round-trips', () => {
  const c = encrypt('ya29.test-refresh', '0123456789abcdef0123456789abcdef');
  expect(decrypt(c, '0123456789abcdef0123456789abcdef')).toBe('ya29.test-refresh');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- tests/crypto.test.js`
Expected: FAIL module not found

- [ ] **Step 3: Minimal implementation**

```js
// server/src/crypto.js
import crypto from 'node:crypto';
export function encrypt(plain, hexKey) {
  const key = Buffer.from(hexKey, 'hex');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
}
export function decrypt(payload, hexKey) {
  const [ivH, tagH, encH] = payload.split(':');
  const key = Buffer.from(hexKey, 'hex');
  const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivH, 'hex'));
  d.setAuthTag(Buffer.from(tagH, 'hex'));
  return d.update(Buffer.from(encH, 'hex'), null, 'utf8') + d.final('utf8');
}
```

```js
// server/src/models/Channel.js
import mongoose from 'mongoose';
export const Channel = mongoose.model('Channel', new mongoose.Schema({
  youtubeChannelId: { type: String, required: true, unique: true },
  title: String, thumbnail: String,
  encryptedRefreshToken: { type: String, required: true },
  status: { type: String, default: 'connected' },
  lastSyncAt: Date,
}, { timestamps: true }));
```

```js
// server/src/youtube.js
import { google } from 'googleapis';
export function oauthClient() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}
export function oauthUrl() {
  return oauthClient().generateAuthUrl({ access_type: 'offline', prompt: 'consent', scope: ['https://www.googleapis.com/auth/youtube.upload', 'https://www.googleapis.com/auth/youtube.readonly'] });
}
export function authedYoutube(refreshToken) {
  const o = oauthClient(); o.setCredentials({ refresh_token: refreshToken });
  return google.youtube({ version: 'v3', auth: o });
}
```

```js
// server/src/routes/channels.js
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { Channel } from '../models/Channel.js';
import { oauthClient, oauthUrl, authedYoutube } from '../youtube.js';
import { encrypt, decrypt } from '../crypto.js';
import { config } from '../config.js';
export const channelsRouter = Router();
channelsRouter.use(requireAuth);
channelsRouter.get('/oauth-url', (_req, res) => res.json({ url: oauthUrl() }));
channelsRouter.get('/callback', async (req, res) => {
  const { tokens } = await oauthClient().getToken(req.query.code);
  const yt = authedYoutube(tokens.refresh_token);
  const { data } = await yt.channels.list({ mine: true, part: ['snippet'] });
  const ch = data.items[0];
  const key = process.env.TOKEN_ENCRYPTION_KEY || config.tokenKey;
  await Channel.findOneAndUpdate({ youtubeChannelId: ch.id },
    { title: ch.snippet.title, thumbnail: ch.snippet.thumbnails?.default?.url, encryptedRefreshToken: encrypt(tokens.refresh_token, key), status: 'connected', lastSyncAt: new Date() },
    { upsert: true });
  res.redirect(`${process.env.FRONTEND_URL}?connected=${ch.id}`);
});
channelsRouter.get('/', async (_req, res) => res.json(await Channel.find().select('-encryptedRefreshToken')));
channelsRouter.delete('/:id', async (req, res) => { await Channel.findByIdAndDelete(req.params.id); res.json({ ok: true }); });
export function getRefreshToken(doc) { return decrypt(doc.encryptedRefreshToken, process.env.TOKEN_ENCRYPTION_KEY || config.tokenKey); }
```

Mount: `app.use('/api/channels', channelsRouter)`.

- [ ] **Step 4: Run tests**

Run: `npm test --prefix server -- tests/crypto.test.js tests/health.test.js tests/auth.test.js`
Expected: PASS 3 files

- [ ] **Step 5: Commit**

```bash
git add server/src/crypto.js server/src/models/Channel.js server/src/youtube.js server/src/routes/channels.js server/tests/crypto.test.js
git commit -m "feat: youtube channel oauth with encrypted tokens"
```

### Task 4: Video upload → Cloudinary + 1h cleanup

**Files:**
- Create: `server/src/models/Video.js`
- Create: `server/src/routes/videos.js`
- Create: `server/src/cleanup.js`
- Test: `server/tests/cleanup.test.js`
- Modify: `server/src/index.js` (start cron)

**Interfaces:**
- Consumes: `requireAuth` (Task 2).
- Produces: `POST /api/videos (multipart field=file) → {videoId, url, expiresAt}`, `Video` model + `runCleanup()` used by Task 5.

- [ ] **Step 1: Write failing test (expiry math)**

```js
// server/tests/cleanup.test.js
import { expiryDate } from '../src/cleanup.js';
test('expiry is 1h ahead', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  expect(expiryDate(now).toISOString()).toBe('2026-01-01T01:00:00.000Z');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- tests/cleanup.test.js`
Expected: FAIL module not found

- [ ] **Step 3: Minimal implementation**

```js
// server/src/models/Video.js
import mongoose from 'mongoose';
export const Video = mongoose.model('Video', new mongoose.Schema({
  cloudinaryUrl: String, cloudinaryPublicId: String, cloudinaryExpiresAt: Date,
  metadata: { title: String, description: String, tags: [String], privacy: { type: String, default: 'private' } },
}, { timestamps: true }));
```

```js
// server/src/cleanup.js
import { v2 as cloudinary } from 'cloudinary';
import { Video } from './models/Video.js';
export const expiryDate = (from = new Date()) => new Date(from.getTime() + 60 * 60 * 1000);
export async function runCleanup() {
  const due = await Video.find({ cloudinaryExpiresAt: { $lt: new Date() }, cloudinaryPublicId: { $ne: null } }).limit(20);
  for (const v of due) {
    try { await cloudinary.uploader.destroy(v.cloudinaryPublicId, { resource_type: 'video' }); } catch (e) { console.error('cleanup fail', v.id, e.message); continue; }
    v.cloudinaryPublicId = null; await v.save();
  }
  return due.length;
}
```

```js
// server/src/routes/videos.js
import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { requireAuth } from '../auth.js';
import { Video } from '../models/Video.js';
import { expiryDate } from '../cleanup.js';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });
export const videosRouter = Router();
videosRouter.use(requireAuth);
videosRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'file required' });
  const done = await new Promise((resolve, reject) => {
    const s = cloudinary.uploader.upload_stream({ resource_type: 'video' }, (e, r) => e ? reject(e) : resolve(r));
    s.end(req.file.buffer);
  });
  const v = await Video.create({ cloudinaryUrl: done.secure_url, cloudinaryPublicId: done.public_id, cloudinaryExpiresAt: expiryDate(), metadata: req.body });
  res.json({ videoId: v.id, url: v.cloudinaryUrl, expiresAt: v.cloudinaryExpiresAt });
});
```

Cron in `index.js`: `import cron from 'node-cron'; import { runCleanup } from './cleanup.js'; cron.schedule('*/10 * * * *', runCleanup);`

Cloudinary config in `index.js`: `import { v2 as cloudinary } from 'cloudinary'; cloudinary.config({ cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY, api_secret: process.env.CLOUDINARY_API_SECRET });`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- tests/cleanup.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/models/Video.js server/src/routes/videos.js server/src/cleanup.js server/src/index.js server/tests/cleanup.test.js
git commit -m "feat: cloudinary upload with 1h expiry"
```

### Task 5: Publications fan-out + per-channel status

**Files:**
- Create: `server/src/models/Publication.js`
- Create: `server/src/routes/publications.js`
- Create: `server/src/fanout.js`
- Test: `server/tests/fanout.test.js`

**Interfaces:**
- Consumes: `Video`, `Channel + getRefreshToken`, `authedYoutube` (Tasks 3-4).
- Produces: `POST /api/publications`, `GET /api/publications?videoId=`, statuses consumed by frontend Task 6.

- [ ] **Step 1: Write failing test (status transition helper)**

```js
// server/tests/fanout.test.js
import { nextStatus } from '../src/fanout.js';
test('upload maps to processing then succeeded', () => {
  expect(nextStatus('uploading')).toBe('processing');
  expect(nextStatus('processing')).toBe('succeeded');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix server -- tests/fanout.test.js`
Expected: FAIL module not found

- [ ] **Step 3: Minimal implementation**

```js
// server/src/models/Publication.js
import mongoose from 'mongoose';
export const Publication = mongoose.model('Publication', new mongoose.Schema({
  videoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Video' },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel' },
  status: { type: String, enum: ['queued','uploading','processing','succeeded','failed'], default: 'queued' },
  youtubeVideoId: String, error: { code: String, message: String },
}, { timestamps: true }));
```

```js
// server/src/fanout.js
import { Publication } from './models/Publication.js';
import { Video } from './models/Video.js';
import { Channel } from './models/Channel.js';
import { authedYoutube } from './youtube.js';
import { getRefreshToken } from './routes/channels.js';
export const nextStatus = (s) => s === 'uploading' ? 'processing' : 'succeeded';
export async function publishOne(pubId) {
  const pub = await Publication.findById(pubId);
  const video = await Video.findById(pub.videoId);
  const channel = await Channel.findById(pub.channelId);
  try {
    pub.status = 'uploading'; await pub.save();
    const yt = authedYoutube(getRefreshToken(channel));
    const resp = await fetch(video.cloudinaryUrl);
    const buf = Buffer.from(await resp.arrayBuffer());
    const { data } = await yt.videos.insert({ part: ['snippet','status'], requestBody: { snippet: { title: video.metadata.title, description: video.metadata.description, tags: video.metadata.tags, categoryId: '22' }, status: { privacyStatus: video.metadata.privacy || 'private' } }, media: { body: buf } });
    pub.status = 'processing'; pub.youtubeVideoId = data.id; await pub.save();
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 10000));
      const { data: v } = await yt.videos.list({ id: [data.id], part: ['status'] });
      if (v.items[0]?.status?.uploadStatus === 'processed') break;
    }
    pub.status = 'succeeded'; await pub.save();
  } catch (e) {
    pub.status = 'failed'; pub.error = { code: e.code || 'UNKNOWN', message: e.message?.slice(0, 500) }; await pub.save();
    if (String(e.message).includes('invalid_grant')) await Channel.findByIdAndUpdate(channel.id, { status: 'needsReconnect' });
  }
}
export function fanout(publicationIds) { publicationIds.forEach(id => publishOne(id)); }
```

```js
// server/src/routes/publications.js
import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { Publication } from '../models/Publication.js';
import { Video } from '../models/Video.js';
import { fanout } from '../fanout.js';
export const publicationsRouter = Router();
publicationsRouter.use(requireAuth);
publicationsRouter.post('/', async (req, res) => {
  const { videoId, channelIds, metadata } = req.body;
  await Video.findByIdAndUpdate(videoId, { metadata });
  const docs = await Publication.insertMany(channelIds.map(channelId => ({ videoId, channelId, status: 'queued' })));
  fanout(docs.map(d => d.id));
  res.json({ ids: docs.map(d => d.id) });
});
publicationsRouter.get('/', async (req, res) => res.json(await Publication.find({ videoId: req.query.videoId }).populate('channelId')));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix server -- tests/fanout.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/models/Publication.js server/src/fanout.js server/src/routes/publications.js server/tests/fanout.test.js
git commit -m "feat: per-channel publish fan-out"
```

### Task 6: Frontend — login, canvas, upload/review/publish

**Files:**
- Create: `client/src/App.jsx`, `client/src/api.js`, `client/src/pages/Login.jsx`, `client/src/pages/Dashboard.jsx`, `client/src/pages/Upload.jsx`, `client/src/components/ChannelNode.jsx`
- Modify: `client/package.json` (add reactflow, tailwind)

**Interfaces:**
- Consumes: all `/api/*` from Tasks 2-5 (`VITE_API_URL`).
- Produces: Vercel-deployed UI; no downstream tasks except deploy.

- [ ] **Step 1: Write failing smoke check (API helper builds auth header)**

```js
// client/src/api.test.js
import { authHeader } from './api.js';
test('attaches bearer', () => { expect(authHeader('abc')).toEqual({ Authorization: 'Bearer abc' }); });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test --prefix client -- src/api.test.js`
Expected: FAIL module not found

- [ ] **Step 3: Minimal implementation**

```js
// client/src/api.js
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const authHeader = (t) => ({ Authorization: `Bearer ${t}` });
const h = () => ({ 'Content-Type': 'application/json', ...authHeader(localStorage.getItem('token') || '') });
export const api = {
  login: (email, password) => fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then(r => r.json()),
  channels: () => fetch(`${BASE}/api/channels`, { headers: h() }).then(r => r.json()),
  oauthUrl: () => fetch(`${BASE}/api/channels/oauth-url`, { headers: h() }).then(r => r.json()),
  upload: (fd) => fetch(`${BASE}/api/videos`, { method: 'POST', headers: authHeader(localStorage.getItem('token') || ''), body: fd }).then(r => r.json()),
  publish: (payload) => fetch(`${BASE}/api/publications`, { method: 'POST', headers: h(), body: JSON.stringify(payload) }).then(r => r.json()),
  pubs: (videoId) => fetch(`${BASE}/api/publications?videoId=${videoId}`, { headers: h() }).then(r => r.json()),
};
```

`Dashboard.jsx`: React Flow with `main` control-center node + one node per channel from `api.channels()`, edges main→each, checkbox select, status color (green/red/yellow), click → detail panel, "Add channel" → `api.oauthUrl()` redirect. `Upload.jsx`: file input → `api.upload(FormData)` → metadata form (title/description/tags/privacy) → channel checkboxes → `api.publish()` → poll `api.pubs(videoId)` every 5s, render per-channel status list.

- [ ] **Step 4: Run + manual verify**

Run: `npm test --prefix client -- src/api.test.js` Expected: PASS. Manual: `npm run dev --prefix client`, login, see canvas, upload test mp4, publish to 1 test channel.

- [ ] **Step 5: Commit**

```bash
git add client/src/api.js client/src/pages client/src/components client/src/App.jsx
git commit -m "feat: dashboard canvas and publish flow"
```

### Task 7: Deploy Vercel + Render + env docs

**Files:**
- Create: `server/render.yaml`
- Create: `.env.example`
- Modify: `client/vercel.json` (rewrite to index)

**Interfaces:**
- Consumes: Tasks 1-6 complete.
- Produces: live URLs, personal-use ready.

- [ ] **Step 1: Write `.env.example` + `render.yaml`**

```bash
# .env.example
MONGO_URI=mongodb+srv://...
JWT_SECRET=long-random-32+
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD_HASH=$2b$10$...
FRONTEND_URL=https://amplifier.vercel.app
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://amplifier-api.onrender.com/api/channels/callback
TOKEN_ENCRYPTION_KEY=64-hex-chars
VITE_API_URL=https://amplifier-api.onrender.com
```

```yaml
# server/render.yaml
services:
  - type: web
    name: amplifier-api
    env: node
    buildCommand: npm install
    startCommand: node src/index.js
```

Generate hash: `node -e "console.log(require('bcryptjs').hashSync('YOUR_PASSWORD',10))"`, key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

- [ ] **Step 2: Deploy backend, verify health**

Run: push to GitHub → Render New Web Service → root `server`, add envs → `curl https://amplifier-api.onrender.com/api/health` Expected: `{"ok":true}`

- [ ] **Step 3: Deploy frontend, end-to-end check**

Run: Vercel import `client/`, env `VITE_API_URL` → open URL → login → Add Channel (Google consent) → upload small unlisted video → Publish → both channels show `succeeded` with YouTube links.

- [ ] **Step 4: Commit**

```bash
git add server/render.yaml .env.example client/vercel.json
git commit -m "chore: vercel+render deploy config"
```
