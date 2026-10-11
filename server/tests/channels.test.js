import request from 'supertest';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('secret123', 8);
process.env.JWT_SECRET = 'test-secret-1234567890test';
vi.mock('../src/youtube.js', () => ({
  oauthClient: () => ({ getToken: async () => ({ tokens: { refresh_token: 'fake-refresh' } }) }),
  authedYoutube: () => ({ channels: { list: async () => ({ data: {} }) } }),
  oauthUrl: () => 'https://accounts.google.com/o/oauth2/v2/auth?client_id=test',
}));
import { createApp } from '../src/app.js';

async function login(app) {
  const r = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'secret123' });
  return r.body.token;
}

test('oauth-url returns 503 when Google OAuth is not configured', async () => {
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  const app = createApp();
  const t = await login(app);
  const res = await request(app).get('/api/channels/oauth-url').set('Authorization', `Bearer ${t}`);
  expect(res.status).toBe(503);
  expect(res.body.error).toMatch(/not configured/i);
});

test('oauth callback is reachable without login (Google redirect carries no token)', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels/callback?code=fake-code');
  expect(res.status).not.toBe(401);
});

test('channel list still requires login', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels');
  expect(res.status).toBe(401);
});

test('callback explains when Google account has no YouTube channel', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels/callback?code=real-code-no-channel');
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/no youtube channel/i);
});
test('oauth-url returns a Google url when configured', async () => {
  process.env.GOOGLE_CLIENT_ID = 'test-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5000/api/channels/callback';
  const app = createApp();
  const t = await login(app);
  const res = await request(app).get('/api/channels/oauth-url').set('Authorization', `Bearer ${t}`);
  expect(res.status).toBe(200);
  expect(res.body.url).toMatch(/accounts\.google\.com/);
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
  delete process.env.GOOGLE_REDIRECT_URI;
});
