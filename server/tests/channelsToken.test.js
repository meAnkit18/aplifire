import request from 'supertest';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('secret123', 8);
process.env.JWT_SECRET = 'test-secret-1234567890test';
process.env.PIPELINE_API_KEY = 'pipe-key-123';
const docs = [{ youtubeChannelId: 'UCxxxx', title: 'Business Mafia', encryptedRefreshToken: 'enc:ref-1', status: 'connected', lastSyncAt: new Date() }];
const chain = (d) => ({ then: (resolve) => Promise.resolve(d).then(resolve), sort: () => Promise.resolve(d) });
vi.mock('../src/models/Channel.js', () => ({
  Channel: {
    findById: async (id) => docs.find((d) => d.youtubeChannelId === id) ?? null,
    findOne: (q) => chain(q.youtubeChannelId ? (docs.find((d) => d.youtubeChannelId === q.youtubeChannelId) ?? null) : (docs[0] ?? null)),
  },
}));
vi.mock('../src/crypto.js', () => ({
  encrypt: (s) => `enc:${s}`,
  decrypt: (s) => String(s).replace(/^enc:/, ''),
}));
vi.mock('../src/youtube.js', () => ({
  oauthClient: () => ({
    getToken: async () => ({ tokens: { refresh_token: 'x' } }),
    setCredentials: () => {},
    getAccessToken: async () => ({ token: 'fresh-token', res: { data: { expires_in: 3500 } } }),
  }),
  authedYoutube: () => ({}),
  oauthUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
}));
import { createApp } from '../src/app.js';

async function login(app) {
  const r = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'secret123' });
  return r.body.token;
}

test('token endpoint requires auth (same shape as the rest)', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels/UCxxxx/token');
  expect(res.status).toBe(401);
  expect(res.body.error).toBe('unauthorized');
});

test('token endpoint rejects a wrong pipeline key', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels/UCxxxx/token').set('Authorization', 'Bearer nope');
  expect(res.status).toBe(401);
});

test('token endpoint 404s an unknown channel', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels/UCunknown/token').set('Authorization', 'Bearer pipe-key-123');
  expect(res.status).toBe(404);
  expect(res.body.error).toMatch(/not connected/i);
});

test('token endpoint returns a fresh access token and never the refresh token', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels/UCxxxx/token').set('Authorization', 'Bearer pipe-key-123');
  expect(res.status).toBe(200);
  expect(res.body.access_token).toBe('fresh-token');
  expect(res.body.youtube_channel_id).toBe('UCxxxx');
  expect(res.body).not.toHaveProperty('refresh_token');
  expect(res.body).not.toHaveProperty('encryptedRefreshToken');
});

test('token endpoint also accepts the admin JWT and resolves "me"', async () => {
  const app = createApp();
  const t = await login(app);
  const res = await request(app).get('/api/channels/me/token').set('Authorization', `Bearer ${t}`);
  expect(res.status).toBe(200);
  expect(res.body.youtube_channel_id).toBe('UCxxxx');
});
