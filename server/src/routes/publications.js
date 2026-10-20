import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { Publication } from '../models/Publication.js';
import { Video } from '../models/Video.js';
import { Channel } from '../models/Channel.js';
import { fanout } from '../fanout.js';
export const publicationsRouter = Router();
publicationsRouter.use(requireAuth);
publicationsRouter.post('/', async (req, res) => {
  try {
    const { videoId, channelIds, metadata } = req.body ?? {};
    if (!videoId || !Array.isArray(channelIds) || !channelIds.length) return res.status(400).json({ error: 'videoId + channelIds[] required' });
    if (metadata) await Video.findByIdAndUpdate(videoId, { metadata });
    const docs = await Publication.insertMany(channelIds.map((channelId) => ({ videoId, channelId, status: 'queued' })));
    fanout(docs.map((d) => d.id));
    res.json({ ids: docs.map((d) => d.id) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
// Register a video that an agent uploaded directly through the YouTube API.
// This makes the video visible to the analytics sync without re-uploading it.
publicationsRouter.post('/register', async (req, res) => {
  try {
    const { channelId, youtubeVideoId, metadata } = req.body ?? {};
    if (!channelId || !youtubeVideoId) return res.status(400).json({ error: 'channelId + youtubeVideoId required' });
    let channel = null;
    try { channel = await Channel.findById(channelId); } catch { channel = null; }
    if (!channel) channel = await Channel.findOne({ youtubeChannelId: channelId });
    if (!channel) return res.status(404).json({ error: 'channel not found' });
    const video = await Video.create({ metadata: metadata || {} });
    const pub = await Publication.create({
      videoId: video.id, channelId: channel._id, status: 'succeeded', youtubeVideoId,
    });
    res.json({ publicationId: pub.id, videoId: video.id, channelId: channel._id, youtubeVideoId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

publicationsRouter.get('/:id', async (req, res) => {
  try {
    const p = await Publication.findById(req.params.id).populate('channelId');
    if (!p) return res.status(404).json({ error: 'not found' });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
publicationsRouter.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.videoId) filter.videoId = req.query.videoId;
    if (req.query.ids) filter._id = { $in: String(req.query.ids).split(',').map((s) => s.trim()).filter(Boolean) };
    if (req.query.status) filter.status = req.query.status;
    res.json(await Publication.find(filter).populate('channelId'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
