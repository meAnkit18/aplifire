import { encrypt, decrypt } from '../src/crypto.js';
test('refresh token round-trips', () => {
  const c = encrypt('ya29.test-refresh', '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  expect(decrypt(c, '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef')).toBe('ya29.test-refresh');
});
