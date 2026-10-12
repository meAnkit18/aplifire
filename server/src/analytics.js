import { Publication } from './models/Publication.js';
import { Channel } from './models/Channel.js';
import { authedYoutube, authedAnalytics } from './youtube.js';
import { getRefreshToken } from './routes/channels.js';
const THROTTLE_MS = 15 * 60 * 1000;
export function parseRange(q) {
  const key = q === '7d' || q === '90d' ? q : '28d';
  const days = key === '7d' ? 7 : key === '90d' ? 90 : 28;
  const end = new Date();
  const start = new Date(end.getTime() - days * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { key, startDate: fmt(start), endDate: fmt(end) };
}
export function totalsFor(pubs) {
  const t = { views: 0, likes: 0, comments: 0, watchMinutes: 0, subsGained: 0 };
  for (const p of pubs) {
    const s = p.stats || {};
    t.views += s.views || 0; t.likes += s.likes || 0; t.comments += s.comments || 0;
    t.watchMinutes += s.watchMinutes || 0; t.subsGained += s.subsGained || 0;
  }
  return t;
}
export function isThrottled(lastSync, now = new Date()) {
  if (!lastSync) return { throttled: false, retryAfterSec: 0 };
  const left = THROTTLE_MS - (now - new Date(lastSync));
  return left > 0 ? { throttled: true, retryAfterSec: Math.ceil(left / 1000) } : { throttled: false, retryAfterSec: 0 };
}
export async function syncPublication(pubId) {
  const pub = await Publication.findById(pubId);
  if (!pub || !pub.youtubeVideoId) return 'skipped';
  const channel = await Channel.findById(pub.channelId);
  if (!channel) return 'skipped';
  const token = getRefreshToken(channel);
  try {
    const yt = authedYoutube(token);
    const { data } = await yt.videos.list({ id: [pub.youtubeVideoId], part: ['statistics'] });
    const st = data.items?.[0]?.statistics || {};
    pub.stats = {
      views: Number(st.viewCount || 0), likes: Number(st.likeCount || 0), comments: Number(st.commentCount || 0),
      watchMinutes: pub.stats?.watchMinutes || 0, avgViewDurationSec: pub.stats?.avgViewDurationSec || 0, subsGained: pub.stats?.subsGained || 0,
    };
    try {
      const ya = authedAnalytics(token);
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
      const { data: rep } = await ya.reports.query({ ids: `channel==${channel.youtubeChannelId}`, 'start-date': start, 'end-date': end, metrics: 'views,estimatedMinutesWatched,averageViewDuration,subscribersGained', filters: `video==${pub.youtubeVideoId}` });
      const vals = rep.rows?.[0] || [];
      pub.stats.watchMinutes = Math.round(Number(vals[1] || 0));
      pub.stats.avgViewDurationSec = Math.round(Number(vals[2] || 0));
      pub.stats.subsGained = Number(vals[3] || 0);
    } catch { /* keep Data API stats when Analytics quota fails */ }
    pub.statsUpdatedAt = new Date();
    await pub.save();
    return 'synced';
  } catch (e) {
    if (String(e.message).includes('invalid_grant')) await Channel.findByIdAndUpdate(channel.id, { status: 'needsReconnect' });
    throw e;
  }
}
