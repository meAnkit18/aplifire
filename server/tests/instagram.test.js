import { isReelUrl, reelId, titleFromCaption } from '../src/instagram.js';
test('accepts reel links in any shape', () => {
  expect(isReelUrl('https://www.instagram.com/reel/ABC123xyz_-/')).toBe('https://www.instagram.com/reel/ABC123xyz_-/');
  expect(isReelUrl('http://instagram.com/reel/ABC123xyz_-?utm_source=ig')).toBe('https://www.instagram.com/reel/ABC123xyz_-/');
  expect(isReelUrl('https://www.instagram.com/reels/DeV9z3cvuWG/')).toBe('https://www.instagram.com/reel/DeV9z3cvuWG/');
});
test('rejects non-reel links', () => {
  expect(isReelUrl('https://www.instagram.com/p/ABC123/')).toBeNull();
  expect(isReelUrl('https://www.youtube.com/watch?v=x')).toBeNull();
  expect(isReelUrl('not a url')).toBeNull();
  expect(isReelUrl('')).toBeNull();
});
test('extracts reel id', () => {
  expect(reelId('https://www.instagram.com/reel/ABC123xyz_-/')).toBe('ABC123xyz_-');
  expect(reelId('https://www.instagram.com/p/ABC/')).toBeNull();
});
test('derives title from caption', () => {
  expect(titleFromCaption('My title\nsecond line', 'ID1')).toBe('My title');
  expect(titleFromCaption('  \n  fallen back  ', 'ID1')).toBe('fallen back');
  expect(titleFromCaption('', 'ID1')).toBe('Instagram reel ID1');
  expect(titleFromCaption('x'.repeat(200), 'ID1')).toBe('x'.repeat(100));
});
