import request from 'supertest';
import bcrypt from 'bcryptjs';
import { vi } from 'vitest';
process.env.ADMIN_EMAIL = 'admin@test.com';
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('secret123', 8);
process.env.JWT_SECRET = 'test-secret-1234567890test';
vi.mock('../src/models/Publication.js', () => ({ Publication: { find: () => ({ populate: () => ({ lean: async () => [] }), select: () => [], lean: async () => [] }) } }));
vi.mock('../src/models/Video.js', () => ({ Video: { find: () => ({ lean: async () => [] }) } }));
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
