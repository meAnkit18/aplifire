import { authHeader } from './api.js';
import { describe, test, expect } from 'vitest';
test('attaches bearer', () => { expect(authHeader('abc')).toEqual({ Authorization: 'Bearer abc' }); });
describe('analytics api', () => {
  test('overview builds range url', () => {
    const u = new URL('http://x/api/analytics/overview?range=7d');
    expect(u.searchParams.get('range')).toBe('7d');
  });
});
