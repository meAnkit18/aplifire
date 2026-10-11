const REEL_RE = /^https?:\/\/(www\.)?instagram\.com\/reels?\/([A-Za-z0-9_-]+)\/?(?:[?#].*)?$/;
export function reelId(url) {
  const m = String(url || '').trim().match(REEL_RE);
  return m ? m[2] : null;
}
export function isReelUrl(url) {
  const id = reelId(url);
  return id ? `https://www.instagram.com/reel/${id}/` : null;
}
export function titleFromCaption(caption, rid) {
  const first = String(caption || '').split('\n').map((l) => l.trim()).find((l) => l);
  if (!first) return `Instagram reel ${rid}`;
  return first.slice(0, 100);
}
export function tagsFromCaption(caption) {
  const tags = [];
  for (const m of String(caption || '').matchAll(/#([A-Za-z0-9_]+)/g)) {
    const t = m[1];
    if (t.length <= 30 && !tags.includes(t)) tags.push(t);
    if (tags.length >= 15) break;
  }
  return tags;
}
