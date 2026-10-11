import { expiryDate } from '../src/cleanup.js';
test('expiry is 1h ahead', () => {
  const now = new Date('2026-01-01T00:00:00Z');
  expect(expiryDate(now).toISOString()).toBe('2026-01-01T01:00:00.000Z');
});
