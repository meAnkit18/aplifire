import { nextStatus } from '../src/fanout.js';
test('upload maps to processing then succeeded', () => {
  expect(nextStatus('uploading')).toBe('processing');
  expect(nextStatus('processing')).toBe('succeeded');
});
