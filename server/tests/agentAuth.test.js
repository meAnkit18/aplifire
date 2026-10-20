import request from 'supertest';
import { vi } from 'vitest';

process.env.PIPELINE_API_KEY = 'agent-key-123';
process.env.JWT_SECRET = 'test-secret-1234567890test';

const channels = [{ _id: 'c1', youtubeChannelId: 'UCagent', title: 'Agent Channel', status: 'connected' }];
const query = (data) => {
  const q = {
    populate: () => q,
    select: () => q,
    lean: () => Promise.resolve(data),
    then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
  };
  return q;
};

vi.mock('../src/models/Channel.js', () => ({
  Channel: {
    find: () => query(channels),
    findById: async () => channels[0],
    findOne: async () => channels[0],
  },
}));
vi.mock('../src/models/Publication.js', () => ({
  Publication: {
    find: () => query([]),
    findById: () => query(null),
  },
}));
vi.mock('../src/models/Video.js', () => ({
  Video: { find: () => query([]) },
}));
vi.mock('../src/models/AgentKey.js', () => ({
  AgentKey: {
    findOne: async () => ({ _id: 'k1' }),
    updateOne: async () => ({}),
  },
}));

import { createApp } from '../src/app.js';

test('agent key lists connected channels', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels').set('Authorization', 'Bearer agent-key-123');
  expect(res.status).toBe(200);
  expect(res.body[0].youtubeChannelId).toBe('UCagent');
});

test('agent key reaches analytics overview', async () => {
  const app = createApp();
  const res = await request(app).get('/api/analytics/overview?range=7d').set('Authorization', 'Bearer agent-key-123');
  expect(res.status).toBe(200);
  expect(res.body.range).toBe('7d');
});

test('agent key rejects an unknown key', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels').set('Authorization', 'Bearer not-the-key');
  expect(res.status).toBe(401);
});

test('a DB-stored amp_ key is accepted', async () => {
  const app = createApp();
  const res = await request(app).get('/api/channels').set('Authorization', 'Bearer amp_deadbeef');
  expect(res.status).toBe(200);
});

test('from-url validates the url before downloading', async () => {
  const app = createApp();
  const res = await request(app)
    .post('/api/videos/from-url')
    .set('Authorization', 'Bearer agent-key-123')
    .send({ url: 'file:///etc/passwd' });
  expect(res.status).toBe(400);
  expect(res.body.error).toMatch(/http/i);
});
