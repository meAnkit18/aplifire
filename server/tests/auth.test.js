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
