import { v2 as cloudinary } from 'cloudinary';
import { Video } from './models/Video.js';
export const expiryDate = (from = new Date()) => new Date(from.getTime() + 60 * 60 * 1000);
export async function runCleanup() {
  const due = await Video.find({ cloudinaryExpiresAt: { $lt: new Date() }, cloudinaryPublicId: { $ne: null } }).limit(20);
  for (const v of due) {
    try { await cloudinary.uploader.destroy(v.cloudinaryPublicId, { resource_type: 'video' }); } catch (e) { console.error('cleanup fail', v.id, e.message); continue; }
    v.cloudinaryPublicId = null; await v.save();
  }
  return due.length;
}
