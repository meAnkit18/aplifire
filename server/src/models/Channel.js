import mongoose from 'mongoose';
export const Channel = mongoose.model('Channel', new mongoose.Schema({
  youtubeChannelId: { type: String, required: true, unique: true },
  title: String, thumbnail: String,
  encryptedRefreshToken: { type: String, required: true },
  status: { type: String, default: 'connected' },
  lastSyncAt: Date,
  stats: { subs: { type: Number, default: 0 }, totalViews: { type: Number, default: 0 }, videoCount: { type: Number, default: 0 } },
}, { timestamps: true }));
