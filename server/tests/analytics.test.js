import { describe, test, expect } from 'vitest';
import { oauthUrl } from '../src/youtube.js';
import { parseRange, totalsFor, isThrottled } from '../src/analytics.js';
import { Publication } from '../src/models/Publication.js';
import { Channel } from '../src/models/Channel.js';
describe('analytics oauth', () => {
  test('oauth url includes yt-analytics readonly scope', () => {
    process.env.GOOGLE_CLIENT_ID = 'x';
    process.env.GOOGLE_CLIENT_SECRET = 'y';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5000/api/channels/callback';
    const url = oauthUrl();
    expect(url).toMatch(/yt-analytics/);
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });
});
describe('stats schema', () => {
  test('publication accepts stats snapshot', () => {
    const p = new Publication({ videoId: '000000000000000000000000', channelId: '000000000000000000000000', stats: { views: 10, likes: 2, comments: 1, watchMinutes: 5, avgViewDurationSec: 30, subsGained: 1 }, statsUpdatedAt: new Date() });
    expect(p.stats.views).toBe(10);
    expect(p.statsUpdatedAt instanceof Date).toBe(true);
  });
  test('channel accepts aggregate stats', () => {
    const c = new Channel({ youtubeChannelId: 'UCtest123', encryptedRefreshToken: 'x', stats: { subs: 100, totalViews: 5000, videoCount: 20 } });
    expect(c.stats.subs).toBe(100);
  });
});
describe('analytics helpers', () => {
  test('parseRange defaults to 28d on garbage', () => {
    expect(parseRange('nope').key).toBe('28d');
  });
  test('totalsFor sums publication stats', () => {
    const t = totalsFor([{ stats: { views: 10, likes: 1, comments: 0, watchMinutes: 3, subsGained: 1 } }, { stats: { views: 5, likes: 2, comments: 1, watchMinutes: 2, subsGained: 0 } }]);
    expect(t).toMatchObject({ views: 15, likes: 3, comments: 1, watchMinutes: 5, subsGained: 1 });
  });
  test('isThrottled blocks syncs under 15 min', () => {
    const now = new Date('2026-10-12T12:00:00Z');
    const recent = new Date('2026-10-12T11:50:00Z');
    expect(isThrottled(recent, now).throttled).toBe(true);
    expect(isThrottled(new Date('2026-10-12T10:00:00Z'), now).throttled).toBe(false);
  });
});
