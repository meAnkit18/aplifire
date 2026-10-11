import { Router } from 'express';
import fs from 'node:fs';
import os from 'node:os';
import { v2 as cloudinary } from 'cloudinary';
import { requireAuth } from '../auth.js';
import { Channel } from '../models/Channel.js';
import { Video } from '../models/Video.js';
import { expiryDate } from '../cleanup.js';
import { isReelUrl, reelId, titleFromCaption, tagsFromCaption } from '../instagram.js';
export const importsRouter = Router();
importsRouter.use(requireAuth);
importsRouter.post('/instagram', async (req, res) => {
  try {
    const normalized = isReelUrl(req.body?.url);
    if (!normalized) return res.status(400).json({ error: 'a valid instagram reel link is required' });
    const channels = await Channel.find().select('_id');
    if (!channels.length) return res.status(400).json({ error: 'no connected channels — connect a channel first' });
    const ytdlp = (await import('yt-dlp-exec')).default;
    let meta = {};
    try {
      const raw = await ytdlp(normalized, { dumpSingleJson: true, noWarnings: true });
      meta = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) { return res.status(502).json({ error: `could not read reel (private, deleted, or rate-limited): ${String(e.message || e).slice(0, 200)}` }); }
    const caption = meta.description || meta.title || '';
    const title = titleFromCaption(caption, reelId(normalized));
    const tags = tagsFromCaption(caption);
    const description = `${caption}\n\nSource: ${normalized}`.trim();
    const prefix = `reel-${Date.now()}-`;
    let file;
    try {
      await ytdlp(normalized, { output: `${os.tmpdir()}/${prefix}%(ext)s`, format: 'mp4/best/b', noWarnings: true });
      file = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith(prefix)).map((f) => `${os.tmpdir()}/${f}`)[0];
      if (!file) throw new Error('download produced no file');
    } catch (e) { return res.status(502).json({ error: `could not download reel: ${String(e.message || e).slice(0, 200)}` }); }
    try {
      const done = await new Promise((resolve, reject) => {
        const s = cloudinary.uploader.upload_stream({ resource_type: 'video' }, (e, r) => e ? reject(e) : resolve(r));
        fs.createReadStream(file).pipe(s);
      });
      const v = await Video.create({
        cloudinaryUrl: done.secure_url, cloudinaryPublicId: done.public_id, cloudinaryExpiresAt: expiryDate(),
        metadata: { title, description, tags, privacy: 'public' },
      });
      res.json({ videoId: v.id, url: v.cloudinaryUrl, metadata: { title, description, tags, privacy: 'public' } });
    } finally { fs.unlink(file, () => {}); }
  } catch (e) { res.status(500).json({ error: e.message }); }
});
