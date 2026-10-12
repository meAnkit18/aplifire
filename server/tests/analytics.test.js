import { describe, test, expect } from 'vitest';
import { oauthUrl } from '../src/youtube.js';
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
