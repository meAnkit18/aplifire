import mongoose from 'mongoose';
export const Video = mongoose.model('Video', new mongoose.Schema({
  cloudinaryUrl: String, cloudinaryPublicId: String, cloudinaryExpiresAt: Date,
  metadata: { title: String, description: String, tags: [String], privacy: { type: String, default: 'private' } },
}, { timestamps: true }));
