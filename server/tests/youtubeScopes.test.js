process.env.GOOGLE_CLIENT_ID = 'test-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:5000/api/channels/callback';
import { oauthUrl } from '../src/youtube.js';

test('oauth url requests upload, readonly, analytics and comment scopes, offline', () => {
  const url = oauthUrl();
  for (const s of ['youtube.upload', 'youtube.readonly', 'yt-analytics.readonly', 'youtube.force-ssl'])
    expect(url).toContain(s);
  expect(url).toContain('access_type=offline');
  expect(url).toContain('prompt=consent');
});
