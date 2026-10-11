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
