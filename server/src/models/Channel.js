import mongoose from 'mongoose';
export const Channel = mongoose.model('Channel', new mongoose.Schema({
  youtubeChannelId: { type: String, required: true, unique: true },
  title: String, thumbnail: String,
  encryptedRefreshToken: { type: String, required: true },
  status: { type: String, default: 'connected' },
  lastSyncAt: Date,
}, { timestamps: true }));
