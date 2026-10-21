import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from '../src/app.js';

const publicIndex = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'index.html');

test('serves the built client at / when server/public exists', async () => {
  if (!existsSync(publicIndex)) return;
  const res = await request(createApp()).get('/');
  expect(res.status).toBe(200);
  expect(res.text).toContain('<div id="root">');
});

test('unknown /api paths stay JSON 404s, not the SPA', async () => {
  const res = await request(createApp()).get('/api/does-not-exist');
  expect(res.status).toBe(404);
  expect(res.text).not.toContain('<div id="root">');
});
