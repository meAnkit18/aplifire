import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { Publication } from '../models/Publication.js';
import { Video } from '../models/Video.js';
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
publicationsRouter.get('/', async (req, res) => res.json(await Publication.find({ videoId: req.query.videoId }).populate('channelId')));
