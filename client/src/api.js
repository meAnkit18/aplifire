const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';
export const authHeader = (t) => ({ Authorization: `Bearer ${t}` });
const h = () => ({ 'Content-Type': 'application/json', ...authHeader(localStorage.getItem('token') || '') });
export const api = {
  login: (email, password) => fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) }).then((r) => r.json()),
  channels: () => fetch(`${BASE}/api/channels`, { headers: h() }).then((r) => r.json()),
  oauthUrl: () => fetch(`${BASE}/api/channels/oauth-url`, { headers: h() }).then((r) => r.json()),
  removeChannel: (id) => fetch(`${BASE}/api/channels/${id}`, { method: 'DELETE', headers: h() }).then((r) => r.json()),
  upload: (fd) => fetch(`${BASE}/api/videos`, { method: 'POST', headers: authHeader(localStorage.getItem('token') || ''), body: fd }).then((r) => r.json()),
  publish: (payload) => fetch(`${BASE}/api/publications`, { method: 'POST', headers: h(), body: JSON.stringify(payload) }).then((r) => r.json()),
  pubs: (videoId) => fetch(`${BASE}/api/publications?videoId=${videoId}`, { headers: h() }).then((r) => r.json()),
  importReel: (url) => fetch(`${BASE}/api/imports/instagram`, { method: 'POST', headers: h(), body: JSON.stringify({ url }) }).then((r) => r.json()),
};
