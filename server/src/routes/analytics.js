import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { Publication } from '../models/Publication.js';
import { Video } from '../models/Video.js';
import { parseRange, totalsFor, isThrottled, syncPublication } from '../analytics.js';
export const analyticsRouter = Router();
analyticsRouter.use(requireAuth);
analyticsRouter.get('/overview', async (req, res) => {
  try {
    const { key } = parseRange(req.query.range);
    const pubs = await Publication.find({ status: 'succeeded' }).populate('channelId', 'title youtubeChannelId').lean();
    const byVideo = new Map();
    for (const p of pubs) {
      if (!byVideo.has(String(p.videoId))) byVideo.set(String(p.videoId), []);
      byVideo.get(String(p.videoId)).push(p);
    }
    const videos = byVideo.size ? await Video.find({ _id: { $in: [...byVideo.keys()] } }).lean() : [];
    const perVideo = videos.map((v) => ({ videoId: v._id, title: v.metadata?.title || 'Untitled', totals: totalsFor(byVideo.get(String(v._id)) || []), channels: (byVideo.get(String(v._id)) || []).length }));
    const perChannelRows = pubs.reduce((acc, p) => {
      const id = String(p.channelId?._id || p.channelId);
      acc[id] = acc[id] || { channelId: id, title: p.channelId?.title || id, totals: { views: 0, likes: 0, comments: 0, watchMinutes: 0, subsGained: 0 } };
      const s = p.stats || {};
      acc[id].totals.views += s.views || 0; acc[id].totals.likes += s.likes || 0; acc[id].totals.comments += s.comments || 0;
      acc[id].totals.watchMinutes += s.watchMinutes || 0; acc[id].totals.subsGained += s.subsGained || 0;
      return acc;
    }, {});
    res.json({ range: key, totals: totalsFor(pubs), perVideo, perChannel: Object.values(perChannelRows) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
analyticsRouter.get('/videos/:videoId', async (req, res) => {
  try {
    const { key } = parseRange(req.query.range);
    const pubs = await Publication.find({ videoId: req.params.videoId }).populate('channelId', 'title youtubeChannelId stats').lean();
    res.json({ range: key, videoId: req.params.videoId, totals: totalsFor(pubs), channels: pubs.map((p) => ({ publicationId: p._id, channelTitle: p.channelId?.title, youtubeVideoId: p.youtubeVideoId, status: p.status, stats: p.stats || {}, dimensions: p.dimensions || {}, statsUpdatedAt: p.statsUpdatedAt || null })) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
analyticsRouter.get('/channels/:channelId', async (req, res) => {
  try {
    const { key } = parseRange(req.query.range);
    const pubs = await Publication.find({ channelId: req.params.channelId }).lean();
    res.json({ range: key, channelId: req.params.channelId, totals: totalsFor(pubs), videos: pubs.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
analyticsRouter.post('/refresh', async (req, res) => {
  try {
    const { videoId } = req.body ?? {};
    const q = videoId ? { videoId, status: 'succeeded' } : { status: 'succeeded' };
    const pubs = await Publication.find(q).select('_id statsUpdatedAt');
    let synced = 0, skipped = 0;
    for (const p of pubs) {
      const { throttled } = isThrottled(p.statsUpdatedAt);
      if (throttled) { skipped++; continue; }
      try { await syncPublication(p.id); synced++; } catch { skipped++; }
    }
    if (pubs.length === 1 && skipped === 1) {
      const { retryAfterSec } = isThrottled(pubs[0].statsUpdatedAt);
      if (retryAfterSec > 0) return res.status(429).json({ error: 'refresh throttled', retryAfterSec });
    }
    res.json({ synced, skipped });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
