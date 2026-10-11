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
channelsRouter.use(requireAuth);
channelsRouter.get('/oauth-url', (_req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    return res.status(503).json({ error: 'Google OAuth is not configured on the server (missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)' });
  res.json({ url: oauthUrl() });
});
channelsRouter.get('/', async (_req, res) => res.json(await Channel.find().select('-encryptedRefreshToken')));
channelsRouter.delete('/:id', async (req, res) => { await Channel.findByIdAndDelete(req.params.id); res.json({ ok: true }); });
export function getRefreshToken(doc) { return decrypt(doc.encryptedRefreshToken, process.env.TOKEN_ENCRYPTION_KEY || config.tokenKey); }
