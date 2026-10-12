# Uploader Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Chrome extension that adds an Upload button to every reel in the Instagram reels feed; one click publishes it to all connected YouTube channels.

**Architecture:** Plain JavaScript, no build step, no dependencies. `extension/api.js` is a classic (non-module) script that exposes `globalThis.AmplifyApi` so the exact same file loads in the content script, popup, service worker, and Node tests. `content.js` injects buttons and forwards clicks; `background.js` performs the three-call upload sequence via `api.js`.

**Tech Stack:** Chrome Manifest V3, vanilla JS, Node built-in `node:test` + `node:assert` for tests (no installs).

## Global Constraints

- Reels feed only: content script matches `https://www.instagram.com/reels/*`.
- No backend changes: only `POST /api/auth/login`, `POST /api/imports/instagram`, `GET /api/channels`, `POST /api/publications` on `https://amplifier-api.onrender.com`.
- Toast-only feedback: button states on the reel itself, no history UI.
- TDD with Node's built-in runner: `node --test extension/api.test.js` from the repo root.
- Every task ends with a commit; push only at the very end.

---

## File Structure

- Create `extension/api.js` — classic script, sets `globalThis.AmplifyApi = { BASE_URL, findReelUrl, login, importReel, getChannels, publishAll, uploadReel }`. No `import`/`export` keywords anywhere so it loads as content script, popup script, worker script (via `importScripts`), and Node CJS alike.
- Create `extension/api.test.js` — `node:test` tests with stubbed `globalThis.fetch` and stub article objects.
- Create `extension/manifest.json` — MV3, `storage` permission, Instagram host permission, popup, content scripts `["api.js", "content.js"]`, background worker with `importScripts`.
- Create `extension/background.js` — classic worker, `importScripts('api.js')`, `chrome.runtime.onMessage` handler for `{ type: 'AMP_UPLOAD', url }`.
- Create `extension/popup.html` + `extension/popup.js` — login form, status text, logout. Classic scripts (no modules).
- Create `extension/README.md` — load-unpacked instructions.

---

### Task 1: Shared API module with tests

**Files:**
- Create: `extension/api.js`
- Test: `extension/api.test.js`

**Interfaces:**
- Consumes: global `fetch` (real in browser/worker, stubbed in tests).
- Produces: `globalThis.AmplifyApi` with `BASE_URL` (`'https://amplifier-api.onrender.com'`), `findReelUrl(article)` → normalized reel URL string or `null`, `login(email, password)` → token string (throws `Error` with server message on failure), `importReel(token, reelUrl)` → `{ videoId, metadata }`, `getChannels(token)` → array, `publishAll(token, videoId, metadata, channelIds)` → array of ids, `uploadReel(token, reelUrl)` → `{ videoId, channelCount }` running import → channels → publish. Used by Tasks 2 and 3.

- [ ] **Step 1: Write the failing test**

```js
const test = require('node:test');
const assert = require('node:assert');
require('./api.js');
const api = globalThis.AmplifyApi;

test('finds reel permalink in an article', () => {
  const article = { querySelector: (sel) => sel.includes('/reel/') ? { href: 'https://www.instagram.com/reels/DeV9z3cvuWG/' } : null };
  assert.strictEqual(api.findReelUrl(article), 'https://www.instagram.com/reel/DeV9z3cvuWG/');
});
test('returns null when no reel link', () => {
  assert.strictEqual(api.findReelUrl({ querySelector: () => null }), null);
});
test('login returns token and throws server message', async () => {
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ token: 'T' }) });
  assert.strictEqual(await api.login('a@b.c', 'pw'), 'T');
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: 'bad login' }) });
  await assert.rejects(() => api.login('a@b.c', 'pw'), /bad login/);
});
test('uploadReel runs import, channels, publish in order', async () => {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    calls.push([url, opts && opts.method]);
    if (url.endsWith('/api/imports/instagram')) return { ok: true, json: async () => ({ videoId: 'V', metadata: { title: 't', description: 'd', tags: ['x'], privacy: 'public' } }) };
    if (url.endsWith('/api/channels')) return { ok: true, json: async () => ([{ _id: 'C1' }, { _id: 'C2' }]) };
    if (url.endsWith('/api/publications')) return { ok: true, json: async () => ({ ids: ['P1', 'P2'] }) };
    throw new Error('unexpected ' + url);
  };
  const r = await api.uploadReel('T', 'https://www.instagram.com/reel/ABC/');
  assert.deepStrictEqual(r, { videoId: 'V', channelCount: 2 });
  assert.deepStrictEqual(calls.map((c) => c[1]), ['POST', 'GET', 'POST']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test extension/api.test.js` from the repo root
Expected: FAIL with "Cannot find module './api.js'".

- [ ] **Step 3: Write minimal implementation**

```js
;(function () {
  const BASE_URL = 'https://amplifier-api.onrender.com';
  function authHeaders(token) {
    return { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
  }
  async function readError(res, fallback) {
    try { const b = await res.json(); if (b && b.error) return b.error; } catch (e) {}
    return fallback + ' (http ' + res.status + ')';
  }
  function findReelUrl(article) {
    if (!article || typeof article.querySelector !== 'function') return null;
    const a = article.querySelector('a[href*="/reel/"]') || article.querySelector('a[href*="/reels/"]');
    const href = a && a.href ? String(a.href) : '';
    const m = href.match(/instagram\.com\/reels?\/([A-Za-z0-9_-]+)/);
    return m ? 'https://www.instagram.com/reel/' + m[1] + '/' : null;
  }
  async function login(email, password) {
    const res = await fetch(BASE_URL + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json();
    if (!res.ok || !body.token) throw new Error((body && body.error) || 'login failed');
    return body.token;
  }
  async function importReel(token, reelUrl) {
    const res = await fetch(BASE_URL + '/api/imports/instagram', {
      method: 'POST', headers: authHeaders(token), body: JSON.stringify({ url: reelUrl }),
    });
    const body = await res.json();
    if (!res.ok || !body.videoId) throw new Error((body && body.error) || 'import failed');
    return body;
  }
  async function getChannels(token) {
    const res = await fetch(BASE_URL + '/api/channels', { headers: authHeaders(token) });
    const body = await res.json();
    if (!res.ok || !Array.isArray(body)) throw new Error((body && body.error) || 'could not load channels');
    return body;
  }
  async function publishAll(token, videoId, metadata, channelIds) {
    const res = await fetch(BASE_URL + '/api/publications', {
      method: 'POST', headers: authHeaders(token),
      body: JSON.stringify({ videoId, channelIds, metadata }),
    });
    const body = await res.json();
    if (!res.ok || !body.ids) throw new Error((body && body.error) || 'publish failed');
    return body.ids;
  }
  async function uploadReel(token, reelUrl) {
    const staged = await importReel(token, reelUrl);
    const channels = await getChannels(token);
    if (!channels.length) throw new Error('no connected channels — connect a channel first');
    const md = staged.metadata || {};
    const metadata = { title: md.title || 'Instagram reel', description: md.description || '', tags: md.tags || [], privacy: 'public' };
    const ids = await publishAll(token, staged.videoId, metadata, channels.map((c) => c._id));
    return { videoId: staged.videoId, channelCount: ids.length };
  }
  globalThis.AmplifyApi = { BASE_URL, findReelUrl, login, importReel, getChannels, publishAll, uploadReel };
})();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test extension/api.test.js` from the repo root
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add extension/api.js extension/api.test.js
git commit -m "feat: extension shared API module with tests"
```

---

### Task 2: Manifest, background worker, popup login

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/background.js`
- Create: `extension/popup.html`
- Create: `extension/popup.js`

**Interfaces:**
- Consumes: `globalThis.AmplifyApi` from Task 1 (`login`, `uploadReel`); `chrome.storage.local` (`token`); `chrome.runtime` messaging.
- Produces: installed extension with working login; background answers `{ type: 'AMP_UPLOAD', url }` with `{ ok, videoId, channelCount }` or `{ ok: false, error }`. Used by Task 3.

- [ ] **Step 1: Write manifest.json**

```json
{
  "manifest_version": 3,
  "name": "Amplifier Reel Uploader",
  "version": "0.1.0",
  "description": "Upload Instagram reels to all your YouTube channels.",
  "permissions": ["storage"],
  "host_permissions": ["https://www.instagram.com/"],
  "background": { "service_worker": "background.js" },
  "action": { "default_popup": "popup.html", "default_title": "Amplifier" },
  "content_scripts": [
    {
      "matches": ["https://www.instagram.com/reels/*"],
      "js": ["api.js", "content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

- [ ] **Step 2: Write background.js**

```js
importScripts('api.js');
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'AMP_UPLOAD') return;
  (async () => {
    const got = await chrome.storage.local.get('token');
    if (!got.token) return { ok: false, error: 'not logged in — open the extension popup and log in' };
    try {
      const r = await globalThis.AmplifyApi.uploadReel(got.token, msg.url);
      return { ok: true, videoId: r.videoId, channelCount: r.channelCount };
    } catch (e) { return { ok: false, error: String((e && e.message) || e) }; }
  })().then(sendResponse);
  return true;
});
```

- [ ] **Step 3: Write popup.html**

```html
<!doctype html>
<html><head><meta charset="utf-8"><style>
body { width: 260px; font: 14px system-ui; padding: 12px; }
input, button { width: 100%; box-sizing: border-box; margin: 4px 0; padding: 8px; }
button { cursor: pointer; }
#msg { font-size: 12px; color: #555; min-height: 16px; }
</style></head><body>
<div id="login">
  <b>Amplifier login</b>
  <input id="email" placeholder="Email">
  <input id="password" type="password" placeholder="Password">
  <button id="go">Log in</button>
</div>
<div id="status" style="display:none">
  <b>Logged in ✓</b>
  <div id="who"></div>
  <button id="out">Log out</button>
</div>
<div id="msg"></div>
<script src="api.js"></script>
<script src="popup.js"></script>
</body></html>
```

- [ ] **Step 4: Write popup.js**

```js
;(function () {
  const $ = (id) => document.getElementById(id);
  async function refresh() {
    const got = await chrome.storage.local.get(['token', 'email']);
    const logged = !!got.token;
    $('login').style.display = logged ? 'none' : '';
    $('status').style.display = logged ? '' : 'none';
    if (logged) $('who').textContent = got.email || '';
  }
  $('go').onclick = async () => {
    $('msg').textContent = 'Logging in…';
    try {
      const token = await globalThis.AmplifyApi.login($('email').value.trim(), $('password').value);
      await chrome.storage.local.set({ token, email: $('email').value.trim() });
      $('password').value = '';
      $('msg').textContent = '';
      refresh();
    } catch (e) { $('msg').textContent = String((e && e.message) || e); }
  };
  $('out').onclick = async () => { await chrome.storage.local.remove(['token', 'email']); refresh(); };
  refresh();
})();
```

- [ ] **Step 5: Validate files (no test runner for UI)**

Run: `node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8')); console.log('manifest OK')"` from the repo root
Expected: `manifest OK`.
Run: `node --check extension/background.js && node --check extension/popup.js && node --check extension/api.js` from the repo root
Expected: no output (all parse).

- [ ] **Step 6: Commit**

```bash
git add extension/manifest.json extension/background.js extension/popup.html extension/popup.js
git commit -m "feat: extension manifest, background worker, popup login"
```

---

### Task 3: Reel buttons content script

**Files:**
- Create: `extension/content.js`
- Create: `extension/README.md`

**Interfaces:**
- Consumes: `globalThis.AmplifyApi.findReelUrl` from Task 1; background message contract from Task 2.
- Produces: visible Upload button per reel; nothing downstream.

- [ ] **Step 1: Write content.js**

```js
;(function () {
  const DONE = 'data-amp-upload';
  function style(btn, text, disabled) {
    btn.textContent = text;
    btn.disabled = !!disabled;
  }
  function addButton(article, url) {
    article.setAttribute(DONE, 'pending');
    const btn = document.createElement('button');
    btn.setAttribute('type', 'button');
    btn.style.cssText = 'position:absolute;top:8px;right:8px;z-index:9999;padding:6px 10px;border:0;border-radius:8px;background:#5b6cff;color:#fff;font-weight:700;cursor:pointer;';
    style(btn, 'Upload', false);
    btn.onclick = async () => {
      if (article.getAttribute(DONE) === 'busy' || article.getAttribute(DONE) === 'done') return;
      article.setAttribute(DONE, 'busy');
      style(btn, '…', true);
      let res;
      try {
        res = await chrome.runtime.sendMessage({ type: 'AMP_UPLOAD', url });
      } catch (e) { res = { ok: false, error: String((e && e.message) || e) }; }
      if (res && res.ok) {
        article.setAttribute(DONE, 'done');
        style(btn, '✓ ' + res.channelCount + ' channels', true);
      } else {
        article.setAttribute(DONE, 'pending');
        btn.title = (res && res.error) || 'failed';
        style(btn, '⚠ retry', false);
      }
    };
    article.appendChild(btn);
  }
  function scan() {
    document.querySelectorAll('article:not([' + DONE + '])').forEach((a) => {
      let url = null;
      try { url = globalThis.AmplifyApi.findReelUrl(a); } catch (e) { url = null; }
      if (url) addButton(a, url);
      else a.setAttribute(DONE, 'skip');
    });
  }
  new MutationObserver(scan).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
```

- [ ] **Step 2: Syntax-check**

Run: `node --check extension/content.js` from the repo root
Expected: no output.

- [ ] **Step 3: Write extension/README.md**

```md
# Amplifier Reel Uploader (Chrome extension)

Adds an Upload button to every reel on instagram.com/reels.
One click publishes the reel to all connected YouTube channels.

## Install (unpacked, no Web Store)

1. Open `chrome://extensions`.
2. Enable Developer mode (top right).
3. Click "Load unpacked" and select the `extension/` folder.
4. Click the Amplifier toolbar icon, log in with your Amplifier
   email + password.

## Use

Scroll instagram.com/reels. Each reel gets an Upload button
(top-right of the reel). Click it: … means working, ✓ means queued
on all channels, ⚠ retry means something failed (hover for why).
```

- [ ] **Step 4: Commit**

```bash
git add extension/content.js extension/README.md
git commit -m "feat: reel upload buttons content script"
```

---

### Task 4: Live verification

**Files:** none (verification only).

- [ ] **Step 1: Push everything**

```bash
git push origin main
```

Expected: `main -> main` (extension files ride along; no deploy needed — Vercel/Render ignore `extension/`).

- [ ] **Step 2: Simulate the content script on the real reels feed**

In the user's Chrome, navigate to `https://www.instagram.com/reels/`, then evaluate the local `extension/api.js` + `extension/content.js` sources in the page (they only touch that tab's DOM plus the production API). Count injected buttons with `document.querySelectorAll('article[data-amp-upload]')`.
Expected: one button per visible reel article, each carrying a `/reel/<id>/` URL (log the URLs, do not click yet).

- [ ] **Step 3: Real upload with user approval**

Only after the user explicitly approves a live test: click one reel's button (or have the user click it), wait for ✓, then confirm via `GET /api/publications` that a new video reached every channel.
Expected: ✓ with channel count, publications `queued`/`uploading`, progressing as usual. If Instagram's DOM differs (button misplaced or missing), adjust the selector/positioning in `content.js`, commit, and re-run Step 2.
