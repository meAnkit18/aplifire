import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { Channel } from '../models/Channel.js';
import { oauthClient, oauthUrl, authedYoutube } from '../youtube.js';
import { encrypt, decrypt } from '../crypto.js';
import { config } from '../config.js';
export const channelsRouter = Router();
channelsRouter.get('/callback', async (req, res) => {
  try {
    const { tokens } = await oauthClient().getToken(req.query.code);
    if (!tokens.refresh_token) return res.status(400).json({ error: 'no refresh token — remove app access in Google account and retry' });
    const yt = authedYoutube(tokens.refresh_token);
    const { data } = await yt.channels.list({ mine: true, part: ['snippet'] });
    const ch = data.items?.[0];
    if (!ch) return res.status(400).json({ error: 'no YouTube channel found on this Google account — create a channel at youtube.com first, then reconnect' });
    const key = process.env.TOKEN_ENCRYPTION_KEY || config.tokenKey;
    await Channel.findOneAndUpdate({ youtubeChannelId: ch.id },
      { title: ch.snippet.title, thumbnail: ch.snippet.thumbnails?.default?.url, encryptedRefreshToken: encrypt(tokens.refresh_token, key), status: 'connected', lastSyncAt: new Date() },
      { upsert: true });
    res.redirect(`${process.env.FRONTEND_URL || config.frontendUrl}?connected=${ch.id}`);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
function requirePipelineAuth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token && process.env.PIPELINE_API_KEY && token === process.env.PIPELINE_API_KEY) return next();
  return requireAuth(req, res, next);
}
channelsRouter.get('/:id/token', requirePipelineAuth, async (req, res) => {
  try {
    const id = req.params.id;
    let doc = null;
    if (id && id !== 'me') {
      try { doc = await Channel.findById(id); } catch { doc = null; }
      if (!doc) doc = await Channel.findOne({ youtubeChannelId: id });
    } else {
      doc = await Channel.findOne({ status: 'connected' }).sort({ lastSyncAt: -1 });
    }
    if (!doc) return res.status(404).json({ error: 'channel not connected — finish the browser auth step first' });
    const o = oauthClient();
    o.setCredentials({ refresh_token: getRefreshToken(doc) });
    const { token, res: tokRes } = await o.getAccessToken();
    res.json({ access_token: token, expires_in: tokRes?.data?.expires_in ?? 3600, youtube_channel_id: doc.youtubeChannelId, title: doc.title });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
channelsRouter.use(requireAuth);
channelsRouter.get('/oauth-url', (_req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    return res.status(503).json({ error: 'Google OAuth is not configured on the server (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)' });
  res.json({ url: oauthUrl() });
});
channelsRouter.get('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    let doc = null;
    try { doc = await Channel.findById(id); } catch { doc = null; }
    if (!doc) doc = await Channel.findOne({ youtubeChannelId: id });
    if (!doc) return res.status(404).json({ error: 'channel not found' });
    res.json({ _id: doc.id, youtubeChannelId: doc.youtubeChannelId, title: doc.title, thumbnail: doc.thumbnail, status: doc.status, lastSyncAt: doc.lastSyncAt, stats: doc.stats });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
channelsRouter.get('/', async (_req, res) => res.json(await Channel.find().select('-encryptedRefreshToken')));
channelsRouter.delete('/:id', async (req, res) => { await Channel.findByIdAndDelete(req.params.id); res.json({ ok: true }); });
export function getRefreshToken(doc) { return decrypt(doc.encryptedRefreshToken, process.env.TOKEN_ENCRYPTION_KEY || config.tokenKey); }
