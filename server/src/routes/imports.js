import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { Channel } from '../models/Channel.js';
import { isReelUrl } from '../instagram.js';
export const importsRouter = Router();
importsRouter.use(requireAuth);
importsRouter.post('/instagram', async (req, res) => {
  try {
    const normalized = isReelUrl(req.body?.url);
    if (!normalized) return res.status(400).json({ error: 'a valid instagram reel link is required' });
    const channels = await Channel.find().select('_id');
    if (!channels.length) return res.status(400).json({ error: 'no connected channels — connect a channel first' });
    return res.status(500).json({ error: 'not implemented' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
