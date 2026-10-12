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
