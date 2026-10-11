import { pickOAuthUrl } from './oauth.js';
test('returns url when present', () => { expect(pickOAuthUrl({ url: 'https://x' })).toBe('https://x'); });
test('throws server error message when no url', () => { expect(() => pickOAuthUrl({ error: 'boom' })).toThrow('boom'); });
test('throws default message when empty', () => { expect(() => pickOAuthUrl({})).toThrow(/not configured/i); });
