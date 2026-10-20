import { Router } from 'express';
import multer from 'multer';
import { v2 as cloudinary } from 'cloudinary';
import { requireAuth } from '../auth.js';
import { Video } from '../models/Video.js';
import { expiryDate } from '../cleanup.js';
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 * 1024 } });
export const videosRouter = Router();
videosRouter.use(requireAuth);
videosRouter.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const done = await new Promise((resolve, reject) => {
      const s = cloudinary.uploader.upload_stream({ resource_type: 'video' }, (e, r) => e ? reject(e) : resolve(r));
      s.end(req.file.buffer);
    });
    const v = await Video.create({ cloudinaryUrl: done.secure_url, cloudinaryPublicId: done.public_id, cloudinaryExpiresAt: expiryDate() });
    res.json({ videoId: v.id, url: v.cloudinaryUrl, expiresAt: v.cloudinaryExpiresAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
videosRouter.get('/:id', async (req, res) => {
  const v = await Video.findById(req.params.id);
  if (!v) return res.status(404).json({ error: 'not found' });
  res.json(v);
});

// Agent-friendly: stage a video from a remote URL (http/https) into Cloudinary.
videosRouter.post('/from-url', async (req, res) => {
  try {
    const { url } = req.body ?? {};
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });
    let parsed;
    try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'invalid url' }); }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return res.status(400).json({ error: 'only http(s) urls are allowed' });
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: `remote fetch ${r.status}` });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 2 * 1024 * 1024 * 1024) return res.status(413).json({ error: 'file too large' });
    const done = await new Promise((resolve, reject) => {
      const s = cloudinary.uploader.upload_stream({ resource_type: 'video' }, (e, r) => e ? reject(e) : resolve(r));
      s.end(buf);
    });
    const v = await Video.create({ cloudinaryUrl: done.secure_url, cloudinaryPublicId: done.public_id, cloudinaryExpiresAt: expiryDate() });
    res.json({ videoId: v.id, url: v.cloudinaryUrl, expiresAt: v.cloudinaryExpiresAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
