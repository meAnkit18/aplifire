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
    calls.push([url, (opts && opts.method) || 'GET']);
    if (url.endsWith('/api/imports/instagram')) return { ok: true, json: async () => ({ videoId: 'V', metadata: { title: 't', description: 'd', tags: ['x'], privacy: 'public' } }) };
    if (url.endsWith('/api/channels')) return { ok: true, json: async () => ([{ _id: 'C1' }, { _id: 'C2' }]) };
    if (url.endsWith('/api/publications')) return { ok: true, json: async () => ({ ids: ['P1', 'P2'] }) };
    throw new Error('unexpected ' + url);
  };
  const r = await api.uploadReel('T', 'https://www.instagram.com/reel/ABC/');
  assert.deepStrictEqual(r, { videoId: 'V', channelCount: 2 });
  assert.deepStrictEqual(calls.map((c) => c[1]), ['POST', 'GET', 'POST']);
});
