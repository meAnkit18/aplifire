import request from 'supertest';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';
process.env.ADMIN_EMAIL = 'import@test.com';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('secret123', 8);
process.env.JWT_SECRET = 'test-secret-1234567890test';
vi.mock('../src/models/Channel.js', () => ({ Channel: { find: () => ({ select: async () => [] }) } }));
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
