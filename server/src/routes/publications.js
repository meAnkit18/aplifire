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
