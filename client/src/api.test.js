import { authHeader } from './api.js';
test('attaches bearer', () => { expect(authHeader('abc')).toEqual({ Authorization: 'Bearer abc' }); });
